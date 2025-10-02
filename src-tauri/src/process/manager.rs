// client/src-tauri/src/process/manager.rs
use crate::process::types::{ProcessConfig, ProcessStatus, ProcessState, ProcessInfo};
use anyhow::{Result, Context};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use uuid::Uuid;
use chrono::Utc;
use tauri::Listener;
use crate::process::terminal_process::{TerminalProcessBridge, TerminalProcessMetadata};
use crate::terminal::types::CreateSessionRequest;

pub struct ProcessManager {
    app_handle: AppHandle,
    // FIXED: Change from HashMap<String, ManagedProcess> to HashMap<String, ManagedProcess>
    // where key is process_id instead of grid_id
    active_processes: Arc<Mutex<HashMap<String, ManagedProcess>>>, // process_id -> ManagedProcess
    terminal_bridge: Arc<TerminalProcessBridge>,
    terminal_metadata: Arc<Mutex<HashMap<String, TerminalProcessMetadata>>>,
}

impl Clone for ManagedProcess {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            child: None, // Child cannot be cloned, so we set it to None
            status: self.status.clone(),
            stdin_sender: self.stdin_sender.clone(),
            grid_id: self.grid_id.clone(),
            process_id: self.process_id.clone(),
            created_at: self.created_at,
            process_type: self.process_type.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProcessType {
    Regular,
    Terminal { session_id: String },
    PortForward { target_port: u16 },
    Discovered { detected_process: crate::discovery::types::DetectedProcess },
}
struct ManagedProcess {
    config: ProcessConfig,
    child: Option<Child>,
    status: ProcessStatus,
    stdin_sender: Option<mpsc::UnboundedSender<Vec<u8>>>,
    grid_id: String,
    process_id: String,
    created_at: u64,
    process_type: ProcessType,
}

impl ProcessManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            terminal_bridge: Arc::new(TerminalProcessBridge::new()),
            terminal_metadata: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn set_terminal_manager(&self, terminal_manager: crate::terminal::manager::TerminalManager) -> Result<()> {
        self.terminal_bridge.set_terminal_manager(terminal_manager).await;
        Ok(())
    }

    pub async fn create_terminal_process(
        &self,
        grid_id: String,
        request: CreateSessionRequest,
        process_name: Option<String>,
    ) -> Result<String> {
        log::info!("Creating terminal process for grid: {}", grid_id);

        let (process_id, process_config, terminal_metadata) = self.terminal_bridge
            .create_terminal_process(grid_id.clone(), request, process_name)
            .await?;

        let managed_process = ManagedProcess {
            config: process_config.clone(),
            child: None,
            status: ProcessStatus {
                process_id: process_id.clone(),
                grid_id: grid_id.clone(),
                state: ProcessState::Running,
                pid: None,
                exit_code: None,
                started_at: chrono::Utc::now().timestamp() as u64,
                error_message: None,
            },
            stdin_sender: None,
            grid_id: grid_id.clone(),
            process_id: process_id.clone(),
            created_at: chrono::Utc::now().timestamp() as u64,
            process_type: ProcessType::Terminal { 
                session_id: terminal_metadata.session_id.clone() 
            },
        };

        {
            let mut processes = self.active_processes.lock().await;
            // FIXED: Use process_id as key, not grid_id
            processes.insert(process_id.clone(), managed_process);
        }

        {
            let mut metadata = self.terminal_metadata.lock().await;
            metadata.insert(process_id.clone(), terminal_metadata);
        }

        self.app_handle.emit("process_started", &serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "config": process_config,
            "process_type": "terminal"
        }))?;

        // MANDATORY: Register terminal process with backend
        let detected_port = self.detect_process_port(&process_id).await;
        if let Err(e) = self.register_process_with_backend(grid_id.clone(), process_id.clone(), &process_config, detected_port).await {
            log::error!("Failed to register terminal process with backend: {}. Process will still run locally but won't be visible to other grid members.", e);
        } else {
            log::info!("Terminal process {} successfully registered with backend", process_id);
        }

        log::info!("Terminal process created: {}", process_id);
        Ok(process_id)
    }

    pub async fn start_process(&self, grid_id: String, config: ProcessConfig) -> Result<String> {
        if TerminalProcessBridge::is_terminal_process(&config) {
            return self.handle_existing_terminal_process(grid_id, config).await;
        }

        if config.executable_path == "internal_port_forward" {
            return self.handle_port_forward_process(grid_id, config).await;
        }

        if config.executable_path == "internal_discovered_process" {
            return self.handle_discovered_process(grid_id, config).await;
        }


        log::info!("Starting regular process for grid {}: {}", grid_id, config.executable_path);

        // REMOVE this check that prevents multiple processes per grid:
        // {
        //     let processes = self.active_processes.lock().await;
        //     if processes.contains_key(&grid_id) {
        //         return Err(anyhow::anyhow!("Grid {} already has a running process", grid_id));
        //     }
        // }

        if !std::path::Path::new(&config.executable_path).exists() {
            return Err(anyhow::anyhow!("Executable not found: {}", config.executable_path));
        }

        let process_id = Uuid::new_v4().to_string();
        let created_at = Utc::now().timestamp() as u64;

        let mut command = Command::new(&config.executable_path);
        command.args(&config.args);
        
        for (key, value) in &config.env_vars {
            command.env(key, value);
        }

        if !config.working_directory.is_empty() {
            command.current_dir(&config.working_directory);
        }

        command.stdin(std::process::Stdio::piped());
        command.stdout(std::process::Stdio::piped());
        command.stderr(std::process::Stdio::piped());

        let mut child = command.spawn()
            .with_context(|| format!("Failed to spawn process: {}", config.executable_path))?;

        log::info!("Process spawned successfully with PID: {:?}", child.id());

        let stdin = child.stdin.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdin handle"))?;
        let stdout = child.stdout.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stdout handle"))?;
        let stderr = child.stderr.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to get stderr handle"))?;

        let (stdin_sender, stdin_receiver) = mpsc::unbounded_channel::<Vec<u8>>();

        self.start_io_proxy_tasks(
            grid_id.clone(),
            process_id.clone(),
            stdin,
            stdout,
            stderr,
            stdin_receiver,
        ).await?;
        
        let managed_process = ManagedProcess {
            config: config.clone(),
            child: Some(child),
            status: ProcessStatus {
                process_id: process_id.clone(),
                grid_id: grid_id.clone(),
                state: ProcessState::Running,
                pid: None,
                exit_code: None,
                started_at: created_at,
                error_message: None,
            },
            stdin_sender: Some(stdin_sender),
            grid_id: grid_id.clone(),
            process_id: process_id.clone(),
            created_at,
            process_type: ProcessType::Regular,
        };

        {
            let mut processes = self.active_processes.lock().await;
            // FIXED: Use process_id as key, not grid_id
            processes.insert(process_id.clone(), managed_process);
        }

        self.start_process_monitor(grid_id.clone(), process_id.clone()).await;

        self.app_handle.emit("process_started", &serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "config": config
        }))?;

        // MANDATORY: Register with backend
        let detected_port = self.detect_process_port(&process_id).await;
        if let Err(e) = self.register_process_with_backend(grid_id.clone(), process_id.clone(), &config, detected_port).await {
            log::error!("Failed to register process with backend: {}. Process will still run locally but won't be visible to other grid members.", e);
        } else {
            log::info!("Process {} successfully registered with backend", process_id);
        }

        log::info!("Process management initialized for grid {}", grid_id);
        Ok(process_id)
    }

    
    pub async fn stop_process(&self, grid_id: String) -> Result<()> {
        log::info!("Stopping process for grid: {}", grid_id);

        // Find and remove the process from the map
        let removed_process = {
            let mut processes = self.active_processes.lock().await;
            let process_key = processes
                .iter()
                .find(|(_, process)| process.grid_id == grid_id)
                .map(|(process_id, _)| process_id.clone());
                
            if let Some(key) = process_key {
                processes.remove(&key)
            } else {
                None
            }
        };

        if let Some(mut managed_process) = removed_process {
            match managed_process.process_type {
                ProcessType::Terminal { ref session_id } => {
                    if let Err(e) = self.terminal_bridge.handle_terminal_termination(&session_id).await {
                        log::error!("Failed to terminate terminal session {}: {}", session_id, e);
                    }
                    let mut metadata = self.terminal_metadata.lock().await;
                    metadata.remove(&managed_process.process_id);
                }
                ProcessType::PortForward { target_port: _ } => {
                    log::info!("Stopped port forward process for grid: {}", grid_id);
                }
                ProcessType::Discovered { .. } => {
                    log::info!("Stopped discovered process for grid: {}", grid_id);
                }
                ProcessType::Regular => {
                    if let Some(mut child) = managed_process.child.take() {
                        match child.kill().await {
                            Ok(_) => log::info!("Regular process killed for grid: {}", grid_id),
                            Err(e) => log::error!("Failed to kill regular process for grid {}: {}", grid_id, e),
                        }
                    }
                }
            }

            self.app_handle.emit("process_stopped", &serde_json::json!({
                "grid_id": grid_id,
                "process_id": managed_process.process_id,
                "process_type": match managed_process.process_type {
                    ProcessType::Terminal { .. } => "terminal",
                    ProcessType::PortForward { .. } => "port_forward",
                    ProcessType::Regular => "regular",
                    ProcessType::Discovered { .. } => "discovered",
                }
            }))?;
        } else {
            return Err(anyhow::anyhow!("No running process found for grid: {}", grid_id));
        }

        Ok(())
    }

    pub async fn get_process_status(&self, grid_id: String) -> Result<ProcessStatus> {
        let processes = self.active_processes.lock().await;
        
        // FIXED: Find process by grid_id instead of using grid_id as key
        if let Some((_, managed_process)) = processes
            .iter()
            .find(|(_, process)| process.grid_id == grid_id) {
            Ok(managed_process.status.clone())
        } else {
            Ok(ProcessStatus {
                process_id: "".to_string(),
                grid_id,
                state: ProcessState::Inactive,
                pid: None,
                exit_code: None,
                started_at: 0,
                error_message: None,
            })
        }
    }

    pub async fn send_process_input(&self, grid_id: String, input: Vec<u8>) -> Result<()> {
        log::debug!("Sending {} bytes to process stdin for grid: {}", input.len(), grid_id);

        let processes = self.active_processes.lock().await;
        
        // FIXED: Find process by grid_id instead of using grid_id as key
        if let Some((_, managed_process)) = processes
            .iter()
            .find(|(_, process)| process.grid_id == grid_id) {
            if let Some(stdin_sender) = &managed_process.stdin_sender {
                stdin_sender.send(input)
                    .map_err(|_| anyhow::anyhow!("Failed to send input to process"))?;
            } else {
                return Err(anyhow::anyhow!("Process for grid {} does not support stdin", grid_id));
            }
        } else {
            return Err(anyhow::anyhow!("No running process found for grid: {}", grid_id));
        }

        Ok(())
    }

    pub async fn handle_p2p_data(&self, grid_id: String, data: Vec<u8>) -> Result<()> {
        self.send_process_input(grid_id, data).await
    }

    pub async fn get_active_processes(&self) -> Vec<ProcessInfo> {
        let processes = self.active_processes.lock().await;
        let terminal_metadata = self.terminal_metadata.lock().await;
        let mut process_list = Vec::new();

        // This is already correct - it iterates over all processes
        for (process_id, managed_process) in processes.iter() {
            let process_info = ProcessInfo {
                process_id: managed_process.process_id.clone(),
                grid_id: managed_process.grid_id.clone(), // grid_id is stored in the process
                config: managed_process.config.clone(),
                status: managed_process.status.clone(),
                created_at: managed_process.created_at,
                process_type: match &managed_process.process_type {
                    ProcessType::Terminal { .. } => crate::process::types::ProcessType::Terminal,
                    ProcessType::PortForward { .. } => crate::process::types::ProcessType::Network,
                    _ => crate::process::types::ProcessType::Unknown,
                },
            };

            if let ProcessType::Terminal { .. } = &managed_process.process_type {
                if let Some(_metadata) = terminal_metadata.get(&managed_process.process_id) {
                    // Terminal-specific handling if needed
                }
            }

            process_list.push(process_info);
        }

        process_list
    }

    pub async fn start_port_forward(&self, grid_id: String, port: u16, _process_name: String) -> Result<String> {
        log::info!("Starting port forward for grid {} on port {}", grid_id, port);
        let process_id = Uuid::new_v4().to_string();
        
        self.app_handle.emit("process_started", &serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "type": "port_forward",
            "port": port
        }))?;

        Ok(process_id)
    }

    pub async fn setup_process_integration(&self, _p2p_manager: Arc<Mutex<Option<crate::p2p::P2PManager>>>) -> Result<()> {
        log::info!("Setting up process integration with P2P");
        Ok(())
    }

    pub async fn setup_p2p_event_listeners(&self) -> Result<()> {
        let app_handle = self.app_handle.clone();
        let active_processes = self.active_processes.clone();

        app_handle.listen("p2p_process_input", move |event| {
            let processes = active_processes.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let (Some(grid_id), Some(data)) = (
                        payload.get("grid_id").and_then(|g| g.as_str()),
                        payload.get("data").and_then(|d| d.as_array())
                    ) {
                        let bytes: Vec<u8> = data.iter()
                            .filter_map(|v| v.as_u64().map(|n| n as u8))
                            .collect();

                        let processes_guard = processes.lock().await;
                        // FIXED: Find process by grid_id instead of using grid_id as key
                        if let Some((_, managed_process)) = processes_guard
                            .iter()
                            .find(|(_, process)| process.grid_id == grid_id) {
                            if let Some(stdin_sender) = &managed_process.stdin_sender {
                                if let Err(e) = stdin_sender.send(bytes) {
                                    log::error!("Failed to send P2P data to process stdin: {}", e);
                                }
                            }
                        } else {
                            log::warn!("No active process found for grid: {}", grid_id);
                        }
                    }
                }
            });
        });

        log::info!("P2P event listeners set up for ProcessManager");
        Ok(())
    }

    pub async fn register_process_with_backend(&self, grid_id: String, process_id: String, config: &ProcessConfig, detected_port: Option<u16>) -> Result<()> {
        let session = crate::auth::storage::get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        let (service_type, protocol) = if let Some(port) = detected_port {
            Self::detect_service_type_from_config(config, port)
        } else {
            ("process".to_string(), None)
        };

        let registration_request = serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "process_type": service_type,
            "service_name": config.executable_path.split('/').last().unwrap_or("Unknown Process"),
            "port": detected_port,
            "protocol": protocol,
            "metadata": serde_json::json!({
                "executable_path": config.executable_path,
                "args": config.args,
                "working_directory": config.working_directory
            }).to_string()
        });

        let client = crate::api::client::CoordinatorClient::new();
        client.register_grid_process(&token, grid_id.clone(), registration_request).await?;

        log::info!("Process {} registered with backend for grid {}", process_id, grid_id);
        Ok(())
    }

    pub async fn update_process_status_with_backend(&self, grid_id: String, process_id: String, status: &str) -> Result<()> {
        let session = crate::auth::storage::get_user_session().await?;
        let token = session
            .ok_or_else(|| anyhow::anyhow!("No active session"))?
            .token;

        let status_update = serde_json::json!({
            "process_id": process_id,
            "status": status,
            "metadata": "{}"
        });

        let client = crate::api::client::CoordinatorClient::new();
        client.update_process_status(&token, grid_id.clone(), status_update).await?;

        log::info!("Process {} status updated to {} for grid {}", process_id, status, grid_id);
        Ok(())
    }

    fn detect_service_type_from_config(config: &ProcessConfig, port: u16) -> (String, Option<String>) {
        let executable = config.executable_path.to_lowercase();
        let args_str = config.args.join(" ").to_lowercase();

        if executable.contains("node") || args_str.contains("npm") || args_str.contains("dev") {
            return ("http_server".to_string(), Some("http".to_string()));
        }

        if executable.contains("python") && (args_str.contains("runserver") || args_str.contains("http.server")) {
            return ("http_server".to_string(), Some("http".to_string()));
        }

        if executable.contains("java") && args_str.contains("server.jar") {
            return ("minecraft_server".to_string(), Some("minecraft".to_string()));
        }

        match port {
            3000 | 3001 | 8000 | 8080 | 5000 | 5173 => ("http_server".to_string(), Some("http".to_string())),
            25565 => ("minecraft_server".to_string(), Some("minecraft".to_string())),
            7777 | 7778 => ("terraria_server".to_string(), Some("terraria".to_string())),
            _ => ("generic_process".to_string(), Some("tcp".to_string())),
        }
    }

    pub async fn start_process_enhanced(&self, grid_id: String, config: ProcessConfig) -> Result<String> {
        let process_id = self.start_process(grid_id.clone(), config.clone()).await?;
        let detected_port = self.detect_process_port(&process_id).await;

        if let Err(e) = self.register_process_with_backend(grid_id.clone(), process_id.clone(), &config, detected_port).await {
            log::warn!("Failed to register process with backend: {}", e);
        }

        self.app_handle.emit("process_started_enhanced", &serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "config": config,
            "detected_port": detected_port
        }))?;

        Ok(process_id)
    }

    async fn detect_process_port(&self, _process_id: &str) -> Option<u16> {
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

        let common_ports = [3000, 3001, 8000, 8080, 5000, 5173, 25565, 7777];
        
        for port in common_ports.iter() {
            if self.check_port_in_use(*port).await {
                return Some(*port);
            }
        }

        None
    }

    async fn check_port_in_use(&self, port: u16) -> bool {
        use tokio::net::TcpListener;
        
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(_) => false,
            Err(_) => true,
        }
    }

    pub async fn stop_process_enhanced(&self, grid_id: String) -> Result<()> {
        let process_id = {
            let processes = self.active_processes.lock().await;
            // FIXED: Find process by grid_id instead of using grid_id as key
            processes
                .iter()
                .find(|(_, process)| process.grid_id == grid_id)
                .map(|(_, p)| p.process_id.clone())
        };

        self.stop_process(grid_id.clone()).await?;

        if let Some(pid) = process_id {
            if let Err(e) = self.update_process_status_with_backend(grid_id.clone(), pid, "stopped").await {
                log::warn!("Failed to update process status with backend: {}", e);
            }
        }

        Ok(())
    }

    async fn handle_existing_terminal_process(&self, grid_id: String, config: ProcessConfig) -> Result<String> {
        if let Some(session_id) = TerminalProcessBridge::extract_session_id_from_process(&config) {
            let process_id = Uuid::new_v4().to_string();

            let managed_process = ManagedProcess {
                config: config.clone(),
                child: None,
                status: ProcessStatus {
                    process_id: process_id.clone(),
                    grid_id: grid_id.clone(),
                    state: ProcessState::Running,
                    pid: None,
                    exit_code: None,
                    started_at: chrono::Utc::now().timestamp() as u64,
                    error_message: None,
                },
                stdin_sender: None,
                grid_id: grid_id.clone(),
                process_id: process_id.clone(),
                created_at: chrono::Utc::now().timestamp() as u64,
                process_type: ProcessType::Terminal { session_id: session_id.clone() },
            };

            {
                let mut processes = self.active_processes.lock().await;
                // FIXED: Use process_id as key, not grid_id
                processes.insert(process_id.clone(), managed_process);
            }

            if let Ok(metadata) = self.terminal_bridge.update_terminal_metadata(&session_id).await {
                let mut metadata_guard = self.terminal_metadata.lock().await;
                metadata_guard.insert(process_id.clone(), metadata);
            }

            Ok(process_id)
        } else {
            Err(anyhow::anyhow!("Invalid terminal process configuration"))
        }
    }

    async fn handle_port_forward_process(&self, grid_id: String, config: ProcessConfig) -> Result<String> {
        if let Some(port_str) = config.args.first() {
            if let Ok(port) = port_str.parse::<u16>() {
                let process_id = Uuid::new_v4().to_string();

                let managed_process = ManagedProcess {
                    config: config.clone(),
                    child: None,
                    status: ProcessStatus {
                        process_id: process_id.clone(),
                        grid_id: grid_id.clone(),
                        state: ProcessState::Running,
                        pid: None,
                        exit_code: None,
                        started_at: chrono::Utc::now().timestamp() as u64,
                        error_message: None,
                    },
                    stdin_sender: None,
                    grid_id: grid_id.clone(),
                    process_id: process_id.clone(),
                    created_at: chrono::Utc::now().timestamp() as u64,
                    process_type: ProcessType::PortForward { target_port: port },
                };

                {
                    let mut processes = self.active_processes.lock().await;
                    // FIXED: Use process_id as key, not grid_id
                    processes.insert(process_id.clone(), managed_process);
                }

                self.app_handle.emit("process_started", &serde_json::json!({
                    "grid_id": grid_id,
                    "process_id": process_id,
                    "config": config,
                    "process_type": "port_forward",
                    "target_port": port
                }))?;

                return Ok(process_id);
            }
        }
        Err(anyhow::anyhow!("Invalid port forward configuration"))
    }
    
    async fn handle_discovered_process(&self, grid_id: String, config: ProcessConfig) -> Result<String> {
        log::info!("Handling discovered process for grid: {}", grid_id);

        let detected_process_id = config.env_vars.get("DISCOVERED_PROCESS_ID")
            .ok_or_else(|| anyhow::anyhow!("Missing discovered process ID"))?;
        
        let original_port: u16 = config.env_vars.get("ORIGINAL_PORT")
            .and_then(|p| p.parse().ok())
            .ok_or_else(|| anyhow::anyhow!("Missing or invalid original port"))?;

        let minimal_detected_process = crate::discovery::types::DetectedProcess {
            pid: 0, // Placeholder PID for discovered processes
            name: config.env_vars.get("DISPLAY_NAME").cloned().unwrap_or("Unknown".to_string()),
            command: config.args.join(" "),
            working_dir: config.working_directory.clone(),
            port: original_port,
            executable_path: config.executable_path.clone(),
        };

        let process_id = Uuid::new_v4().to_string();

        let managed_process = ManagedProcess {
            config: config.clone(),
            child: None,
            status: ProcessStatus {
                process_id: process_id.clone(),
                grid_id: grid_id.clone(),
                state: ProcessState::Running,
                pid: None,
                exit_code: None,
                started_at: chrono::Utc::now().timestamp() as u64,
                error_message: None,
            },
            stdin_sender: None,
            grid_id: grid_id.clone(),
            process_id: process_id.clone(),
            created_at: chrono::Utc::now().timestamp() as u64,
            process_type: ProcessType::Discovered { detected_process: minimal_detected_process },
        };

        {
            let mut processes = self.active_processes.lock().await;
            // FIXED: Use process_id as key, not grid_id
            processes.insert(process_id.clone(), managed_process);
        }

        self.app_handle.emit("process_started", &serde_json::json!({
            "grid_id": grid_id,
            "process_id": process_id,
            "config": config,
            "process_type": "discovered",
            "original_port": original_port
        }))?;

        log::info!("Discovered process registered: {}", process_id);
        Ok(process_id)
    }



    async fn start_io_proxy_tasks(
        &self,
        grid_id: String,
        process_id: String,
        mut stdin: tokio::process::ChildStdin,
        stdout: tokio::process::ChildStdout,
        stderr: tokio::process::ChildStderr,
        mut stdin_receiver: mpsc::UnboundedReceiver<Vec<u8>>,
    ) -> Result<()> {
        let app_handle = self.app_handle.clone();

        let grid_id_stdin = grid_id.clone();
        tokio::spawn(async move {
            while let Some(data) = stdin_receiver.recv().await {
                match stdin.write_all(&data).await {
                    Ok(_) => {
                        match stdin.flush().await {
                            Ok(_) => log::debug!("Sent {} bytes to process stdin", data.len()),
                            Err(e) => log::error!("Failed to flush stdin: {}", e),
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to write to process stdin: {}", e);
                        break;
                    }
                }
            }
            log::info!("Stdin proxy task ended for grid: {}", grid_id_stdin);
        });

        let grid_id_stdout = grid_id.clone();
        let app_handle_stdout = app_handle.clone();
        let process_id_stdout = process_id.clone();
        let process_id_stderr = process_id.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut buffer = Vec::new();

            loop {
                buffer.clear();
                match reader.read_until(b'\n', &mut buffer).await {
                    Ok(0) => break,
                    Ok(_) => {
                        if let Err(e) = app_handle_stdout.emit("process_stdout", &serde_json::json!({
                            "grid_id": grid_id_stdout,
                            "process_id": process_id_stdout,
                            "data": buffer.clone()
                        })) {
                            log::error!("Failed to emit stdout event: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to read stdout: {}", e);
                        break;
                    }
                }
            }
            log::info!("Stdout proxy task ended for grid: {}", grid_id_stdout);
        });

        let grid_id_stderr = grid_id.clone();
        let app_handle_stderr = app_handle.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = String::new();

            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        log::warn!("Process stderr [{}]: {}", grid_id_stderr, line.trim());
                        
                        if let Err(e) = app_handle_stderr.emit("process_stderr", &serde_json::json!({
                            "grid_id": grid_id_stderr,
                            "process_id": process_id_stderr,
                            "data": line.trim()
                        })) {
                            log::error!("Failed to emit stderr event: {}", e);
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to read stderr: {}", e);
                        break;
                    }
                }
            }
            log::info!("Stderr proxy task ended for grid: {}", grid_id_stderr);
        });

        Ok(())
    }

    async fn start_process_monitor(&self, grid_id: String, process_id: String) {
        let processes = self.active_processes.clone();
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            let exit_status = {
                let mut processes_guard = processes.lock().await;
                // FIXED: Find process by grid_id instead of using grid_id as key
                let mut target_process = None;
                let mut target_process_id = None;
                
                for (pid, managed_process) in processes_guard.iter_mut() {
                    if managed_process.grid_id == grid_id {
                        target_process = Some(managed_process);
                        target_process_id = Some(pid.clone());
                        break;
                    }
                }
                
                if let Some(managed_process) = target_process {
                    if let Some(child) = &mut managed_process.child {
                        match child.wait().await {
                            Ok(status) => Some(status),
                            Err(e) => {
                                log::error!("Error waiting for process: {}", e);
                                None
                            }
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            if exit_status.is_some() {
                let mut processes_guard = processes.lock().await;
                
                // Find the process again to update its status
                let mut target_managed_process = None;
                let mut target_process_id = None;
                
                for (pid, managed_process) in processes_guard.iter_mut() {
                    if managed_process.grid_id == grid_id {
                        managed_process.status.state = ProcessState::Exited;
                        managed_process.status.exit_code = exit_status.and_then(|s| s.code());
                        target_managed_process = Some(managed_process.clone());
                        target_process_id = Some(pid.clone());
                        break;
                    }
                }
                
                if let Some(managed_process) = target_managed_process {
                    if let Err(e) = app_handle.emit("process_exited", &serde_json::json!({
                        "grid_id": grid_id,
                        "process_id": process_id,
                        "exit_code": managed_process.status.exit_code
                    })) {
                        log::error!("Failed to emit process exit event: {}", e);
                    }
                }
                
                if let Some(pid) = target_process_id {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    processes_guard.remove(&pid);
                    log::info!("Process monitor task ended for grid: {}", grid_id);
                }
            }
        });
    }

    pub async fn send_terminal_input(&self, grid_id: String, input: Vec<u8>) -> Result<()> {
        let processes = self.active_processes.lock().await;
        
        // FIXED: Find process by grid_id instead of using grid_id as key
        if let Some((_, managed_process)) = processes
            .iter()
            .find(|(_, process)| process.grid_id == grid_id) {
            if let ProcessType::Terminal { session_id } = &managed_process.process_type {
                return self.terminal_bridge.send_terminal_input(session_id, input).await;
            }
        }
        
        Err(anyhow::anyhow!("No terminal process found for grid: {}", grid_id))
    }

    pub async fn get_terminal_process_status(&self, grid_id: String) -> Result<ProcessStatus> {
        let processes = self.active_processes.lock().await;
        
        // FIXED: Find process by grid_id instead of using grid_id as key
        if let Some((_, managed_process)) = processes
            .iter()
            .find(|(_, process)| process.grid_id == grid_id) {
            if let ProcessType::Terminal { session_id } = &managed_process.process_type {
                return self.terminal_bridge.get_terminal_status(session_id).await;
            }
        }
        
        self.get_process_status(grid_id).await
    }

    pub async fn has_terminal_process(&self, grid_id: &str) -> bool {
        let processes = self.active_processes.lock().await;
        // FIXED: Search through all processes to find one with matching grid_id
        processes
            .iter()
            .any(|(_, process)| process.grid_id == grid_id && matches!(process.process_type, ProcessType::Terminal { .. }))
    }

    pub async fn get_terminal_session_id(&self, grid_id: &str) -> Option<String> {
        let processes = self.active_processes.lock().await;
        // FIXED: Search through all processes to find terminal with matching grid_id
        for (_, managed_process) in processes.iter() {
            if managed_process.grid_id == grid_id {
                if let ProcessType::Terminal { session_id } = &managed_process.process_type {
                    return Some(session_id.clone());
                }
            }
        }
        None
    }

    pub async fn get_terminal_session_id_by_process_id(&self, process_id: &str) -> Option<String> {
        let processes = self.active_processes.lock().await;
        if let Some(managed_process) = processes.get(process_id) {
            if let ProcessType::Terminal { session_id } = &managed_process.process_type {
                return Some(session_id.clone());
            }
        }
        None
    }
    
    pub async fn setup_terminal_recovery_listener(&self) -> Result<()> {
        let app_handle = self.app_handle.clone();
        let active_processes = self.active_processes.clone();

        app_handle.listen("terminal_process_recovered", move |event| {
            let processes = active_processes.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    if let (Some(process_info), Some(recovery_type), Some(session_id)) = (
                        payload.get("process_info"),
                        payload.get("recovery_type").and_then(|v| v.as_str()),
                        payload.get("session_id").and_then(|v| v.as_str()),
                    ) {
                        log::info!("Processing terminal recovery: {} (type: {})", session_id, recovery_type);
                        
                        if let Ok(info) = serde_json::from_value::<ProcessInfo>(process_info.clone()) {
                            let managed_process = ManagedProcess {
                                config: info.config.clone(),
                                child: None,
                                status: info.status.clone(),
                                stdin_sender: None,
                                grid_id: info.grid_id.clone(),
                                process_id: info.process_id.clone(),
                                created_at: info.created_at,
                                process_type: ProcessType::Terminal { 
                                    session_id: session_id.to_string() 
                                },
                            };

                            {
                                let mut processes_guard = processes.lock().await;
                                // FIXED: Use process_id as key, not grid_id
                                processes_guard.insert(info.process_id.clone(), managed_process);
                            }

                            log::info!("Recovered terminal {} registered as process in grid: {}", 
                                    session_id, info.grid_id);
                        } else {
                            log::error!("Failed to parse process info from terminal recovery event");
                        }
                    }
                }
            });
        });

        log::info!("Terminal recovery listener set up for ProcessManager");
        Ok(())
    }

    pub async fn get_terminal_processes(&self) -> Vec<ProcessInfo> {
        let processes = self.active_processes.lock().await;
        let mut terminal_processes = Vec::new();

        for (process_id, managed_process) in processes.iter() {
            if matches!(managed_process.process_type, ProcessType::Terminal { .. }) {
                let process_info = ProcessInfo {
                    process_id: managed_process.process_id.clone(),
                    grid_id: managed_process.grid_id.clone(),
                    config: managed_process.config.clone(),
                    status: managed_process.status.clone(),
                    created_at: managed_process.created_at,
                    process_type: crate::process::types::ProcessType::Terminal,
                };
                terminal_processes.push(process_info);
            }
        }

        terminal_processes
    }

    pub async fn get_all_processes_including_terminals(&self) -> Vec<ProcessInfo> {
        let processes = self.active_processes.lock().await;
        let mut all_processes = Vec::new();

        log::info!("DEBUG: get_all_processes_including_terminals called");
        log::info!("DEBUG: ProcessManager instance has {} processes", processes.len());

        for (process_id, managed_process) in processes.iter() {
            log::info!("DEBUG: Process in process_id '{}': type={:?}, grid_id={}", 
                    process_id, managed_process.process_type, managed_process.grid_id);
            
            let mut process_info = ProcessInfo {
                process_id: managed_process.process_id.clone(),
                grid_id: managed_process.grid_id.clone(),
                config: managed_process.config.clone(),
                status: managed_process.status.clone(),
                created_at: managed_process.created_at,
                process_type: match &managed_process.process_type {
                    ProcessType::Terminal { .. } => crate::process::types::ProcessType::Terminal,
                    ProcessType::PortForward { .. } => crate::process::types::ProcessType::Network,
                    _ => crate::process::types::ProcessType::Unknown,
                },
            };

            if let ProcessType::Terminal { session_id } = &managed_process.process_type {
                process_info.config.executable_path = format!("Recovered Terminal ({})", &session_id[0..8]);
                process_info.status.state = ProcessState::Running;
                
                log::info!("DEBUG: Found recovered terminal: session_id={}, process_id={}", 
                        session_id, managed_process.process_id);
            }

            all_processes.push(process_info);
        }

        log::info!("DEBUG: Returning {} processes total", all_processes.len());
        all_processes
    }
}