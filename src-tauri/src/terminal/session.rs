// src-tauri/src/terminal/session.rs - Simplified without persistence

use super::shell::{ShellDetector, ShellType};
use super::types::{
    OutputType, SessionHistoryEntry, TerminalConfig, TerminalError, TerminalInput,
    TerminalOutput, TerminalSessionInfo,
};
use anyhow::{Context, Result};
use chrono::Utc;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtyPair, PtySize};
use std::collections::{VecDeque, HashMap};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

pub struct TerminalSession {
    pub session_id: String,
    pub grid_id: Option<String>,
    shell_type: ShellType,
    working_directory: Arc<Mutex<String>>,
    created_at: chrono::DateTime<Utc>,
    last_activity: Arc<Mutex<chrono::DateTime<Utc>>>,
    
    // PTY components
    pty_pair: Arc<Mutex<Option<PtyPair>>>,
    child_process: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
    
    // Communication channels
    input_sender: mpsc::UnboundedSender<Vec<u8>>,
    output_broadcaster: broadcast::Sender<TerminalOutput>,
    
    // Session state
    is_active: Arc<Mutex<bool>>,
    connected_users: Arc<Mutex<Vec<String>>>,
    
    // History management (in-memory only)
    history: Arc<Mutex<VecDeque<SessionHistoryEntry>>>,
    config: TerminalConfig,
    session_name: Option<String>,
    
    // Additional session info (no persistence)
    command_history: Arc<Mutex<Vec<String>>>,
    current_command: Arc<Mutex<Option<String>>>,
    environment_vars: Arc<Mutex<HashMap<String, String>>>,
    process_pid: Arc<Mutex<Option<u32>>>,
}

impl TerminalSession {
    /// Create a new terminal session
    pub fn new(
        grid_id: Option<String>,
        shell_type: Option<ShellType>,
        working_directory: Option<String>,
        config: TerminalConfig,
        session_name: Option<String>,
    ) -> Result<Self> {
        let session_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        
        let name = session_name.or_else(|| {
            Some(crate::terminal::name_generator::generate_random_terminal_name())
        });

        // Detect shell if not specified
        let shell = shell_type.unwrap_or_else(|| {
            ShellDetector::detect_user_preferred_shell()
                .unwrap_or_else(|_| ShellDetector::detect_best_shell().unwrap_or(
                    if cfg!(windows) { ShellType::Cmd } else { ShellType::Bash }
                ))
        });

        // Determine working directory
        let work_dir = working_directory.unwrap_or_else(|| {
            ShellDetector::get_default_working_directory()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });

        // Create communication channels
        let (input_sender, input_receiver) = mpsc::unbounded_channel();
        let (output_broadcaster, _) = broadcast::channel(1000);

        let session = Self {
            session_id: session_id.clone(),
            grid_id,
            shell_type: shell,
            working_directory: Arc::new(Mutex::new(work_dir)),
            created_at: now,
            last_activity: Arc::new(Mutex::new(now)),
            pty_pair: Arc::new(Mutex::new(None)),
            child_process: Arc::new(Mutex::new(None)),
            input_sender,
            output_broadcaster,
            is_active: Arc::new(Mutex::new(false)),
            connected_users: Arc::new(Mutex::new(Vec::new())),
            history: Arc::new(Mutex::new(VecDeque::new())),
            config,
            session_name: name,
            command_history: Arc::new(Mutex::new(Vec::new())),
            current_command: Arc::new(Mutex::new(None)),
            environment_vars: Arc::new(Mutex::new(HashMap::new())),
            process_pid: Arc::new(Mutex::new(None)),
        };

        // Start the session
        session.start_pty_session(input_receiver)?;

        Ok(session)
    }

    /// Start the PTY session and I/O handlers
    fn start_pty_session(&self, input_receiver: mpsc::UnboundedReceiver<Vec<u8>>) -> Result<()> {
        let pty_system = native_pty_system();
        
        // Create PTY with reasonable size
        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to create PTY")?;

        // Build command for shell
        let (shell_cmd, shell_args) = self.shell_type.get_command_and_args();
        let mut cmd = CommandBuilder::new(shell_cmd);

        if matches!(self.shell_type, ShellType::Bash | ShellType::Zsh) && self.config.enable_colors {
            // Create custom args that source our color setup first
            let custom_args = match self.shell_type {
                ShellType::Bash => vec!["--login", "-i", "-c", "export PS1='\\[\\033[1;32m\\]\\u@roguegrid\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '; exec bash --login -i"],
                ShellType::Zsh => vec!["--login", "-i", "-c", "export PS1='\\[\\033[1;32m\\]\\u@roguegrid\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\$ '; exec zsh --login -i"],
                _ => shell_args,
            };
            cmd.args(custom_args);
        } else {
            cmd.args(shell_args);
        }
        cmd.cwd(&*self.working_directory.lock());

        // Set environment variables
        for (key, value) in self.shell_type.get_environment_vars(&self.config) {
            cmd.env(key, value);
        }
        for (key, value) in self.environment_vars.lock().iter() {
            cmd.env(key, value);
        }

        
        // Spawn the child process
        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .context("Failed to spawn shell process")?;

        log::info!("Started terminal session {} with {} shell", 
                  self.session_id, self.shell_type.as_str());

        // Store PID
        if let Some(pid) = child.process_id() {
            *self.process_pid.lock() = Some(pid);
            log::info!("Terminal session {} has PID: {}", self.session_id, pid);
        }

        // Store PTY and child process
        {
            let mut pty_guard = self.pty_pair.lock();
            *pty_guard = Some(pty_pair);
        }
        {
            let mut child_guard = self.child_process.lock();
            *child_guard = Some(child);
        }

        // Mark as active
        {
            let mut active = self.is_active.lock();
            *active = true;
        }

        // Start I/O handling threads
        self.start_io_handlers(input_receiver)?;

        Ok(())
    }

    /// Start background threads for handling I/O
    fn start_io_handlers(&self, input_receiver: mpsc::UnboundedReceiver<Vec<u8>>) -> Result<()> {
        let pty_pair = self.pty_pair.clone();
        let session_id = self.session_id.clone();
        let output_broadcaster = self.output_broadcaster.clone();
        let history = self.history.clone();
        let last_activity = self.last_activity.clone();
        let is_active = self.is_active.clone();
        let config = self.config.clone();

        // Start output reading thread
        thread::spawn(move || {
            if let Err(e) = Self::handle_pty_output(
                pty_pair.clone(),
                session_id.clone(),
                output_broadcaster,
                history,
                last_activity.clone(),
                is_active.clone(),
                config,
            ) {
                log::error!("PTY output handler error for session {}: {}", session_id, e);
            }
        });

        // Start input writing thread
        let pty_pair_input = self.pty_pair.clone();
        let session_id_input = self.session_id.clone();
        let last_activity_input = self.last_activity.clone();
        let is_active_input = self.is_active.clone();

        thread::spawn(move || {
            if let Err(e) = Self::handle_pty_input(
                pty_pair_input,
                session_id_input,
                input_receiver,
                last_activity_input,
                is_active_input,
            ) {
                log::error!("PTY input handler error: {}", e);
            }
        });

        Ok(())
    }

    /// Handle reading output from PTY
    fn handle_pty_output(
        pty_pair: Arc<Mutex<Option<PtyPair>>>,
        session_id: String,
        output_broadcaster: broadcast::Sender<TerminalOutput>,
        history: Arc<Mutex<VecDeque<SessionHistoryEntry>>>,
        last_activity: Arc<Mutex<chrono::DateTime<Utc>>>,
        is_active: Arc<Mutex<bool>>,
        config: TerminalConfig,
    ) -> Result<()> {
        let mut reader = {
            let pty_guard = pty_pair.lock();
            if let Some(ref pty) = *pty_guard {
                pty.master.try_clone_reader()
                    .context("Failed to clone PTY reader")?
            } else {
                return Err(anyhow::anyhow!("PTY not available"));
            }
        };

        let mut buffer = [0u8; 8192];
        
        loop {
            // Check if session is still active
            {
                let active = is_active.lock();
                if !*active {
                    break;
                }
            }

            match reader.read(&mut buffer) {
                Ok(0) => {
                    log::info!("PTY output stream ended for session {}", session_id);
                    break;
                }
                Ok(n) => {
                    let data = buffer[..n].to_vec();
                    let now = Utc::now();

                    // Update last activity
                    {
                        let mut activity = last_activity.lock();
                        *activity = now;
                    }

                    // Create output message
                    let output = TerminalOutput {
                        session_id: session_id.clone(),
                        timestamp: now,
                        data: data.clone(),
                        output_type: OutputType::Stdout,
                    };

                    // Add to in-memory history
                    {
                        let mut hist = history.lock();
                        hist.push_back(SessionHistoryEntry {
                            timestamp: now,
                            data: data.clone(),
                            output_type: OutputType::Stdout,
                        });

                        // Trim history if needed
                        while hist.len() > config.max_history_lines {
                            hist.pop_front();
                        }

                        // Check history size
                        let total_size: usize = hist.iter().map(|entry| entry.data.len()).sum();
                        while total_size > config.max_history_size_bytes && !hist.is_empty() {
                            hist.pop_front();
                        }
                    }

                    // Broadcast to subscribers
                    if let Err(e) = output_broadcaster.send(output) {
                        log::debug!("No active subscribers for session {}: {}", session_id, e);
                    }
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::WouldBlock {
                        thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                    log::error!("Error reading from PTY: {}", e);
                    break;
                }
            }
        }

        // Mark session as inactive
        {
            let mut active = is_active.lock();
            *active = false;
        }

        log::info!("PTY output handler stopped for session {}", session_id);
        Ok(())
    }

    /// Handle writing input to PTY
    fn handle_pty_input(
        pty_pair: Arc<Mutex<Option<PtyPair>>>,
        session_id: String,
        mut input_receiver: mpsc::UnboundedReceiver<Vec<u8>>,
        last_activity: Arc<Mutex<chrono::DateTime<Utc>>>,
        is_active: Arc<Mutex<bool>>,
    ) -> Result<()> {
        let mut writer = {
            let pty_guard = pty_pair.lock();
            if let Some(ref pty) = *pty_guard {
                pty.master.take_writer()
                    .context("Failed to get PTY writer")?
            } else {
                return Err(anyhow::anyhow!("PTY not available"));
            }
        };

        std::thread::spawn(move || {
            while let Some(data) = input_receiver.blocking_recv() {
                {
                    let active = is_active.lock();
                    if !*active {
                        break;
                    }
                }

                if let Err(e) = writer.write_all(&data) {
                    log::error!("Failed to write to PTY for session {}: {}", session_id, e);
                    break;
                }

                if let Err(e) = writer.flush() {
                    log::error!("Failed to flush PTY writer for session {}: {}", session_id, e);
                    break;
                }

                {
                    let mut activity = last_activity.lock();
                    *activity = Utc::now();
                }

                log::debug!("Sent {} bytes to PTY for session {}", data.len(), session_id);
            }

            log::info!("PTY input handler stopped for session {}", session_id);
        });

        Ok(())
    }

    /// Send input to the terminal
    pub fn send_input(&self, input: TerminalInput) -> Result<()> {
        {
            let active = self.is_active.lock();
            if !*active {
                return Err(TerminalError::SessionNotFound(self.session_id.clone()).into());
            }
        }

        self.input_sender
            .send(input.data)
            .map_err(|_| anyhow::anyhow!("Failed to send input to terminal session"))?;

        Ok(())
    }

    /// Subscribe to terminal output
    pub fn subscribe_to_output(&self) -> broadcast::Receiver<TerminalOutput> {
        self.output_broadcaster.subscribe()
    }

    /// Get session information
    pub fn get_info(&self) -> TerminalSessionInfo {
        TerminalSessionInfo {
            session_id: self.session_id.clone(),
            grid_id: self.grid_id.clone(),
            shell_type: self.shell_type.to_string(),
            working_directory: self.working_directory.lock().clone(),
            created_at: self.created_at,
            last_activity: *self.last_activity.lock(),
            is_active: *self.is_active.lock(),
            connected_users: self.connected_users.lock().clone(),
            session_name: self.session_name.clone().or_else(|| Some(format!("Terminal {}", &self.session_id[0..8]))),
            initial_command: self.current_command.lock().clone(),
        }
    }

    /// Get session history for reconnection (in-memory only)
    pub fn get_history(&self, lines: Option<usize>) -> Vec<SessionHistoryEntry> {
        let history = self.history.lock();
        let take_lines = lines.unwrap_or(self.config.max_history_lines);
        
        history
            .iter()
            .rev()
            .take(take_lines)
            .rev()
            .cloned()
            .collect()
    }

    /// Add a connected user
    pub fn add_connected_user(&self, user_id: String) {
        let mut users = self.connected_users.lock();
        if !users.contains(&user_id) {
            users.push(user_id);
        }
    }

    /// Remove a connected user
    pub fn remove_connected_user(&self, user_id: &str) {
        let mut users = self.connected_users.lock();
        users.retain(|id| id != user_id);
    }

    /// Resize the terminal
    pub fn resize(&self, rows: u16, cols: u16) -> Result<()> {
        let pty_guard = self.pty_pair.lock();
        if let Some(ref pty) = *pty_guard {
            pty.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            }).context("Failed to resize PTY")?;
        }
        Ok(())
    }

    /// Terminate the session
    pub fn terminate(&self) -> Result<()> {
        log::info!("Terminating terminal session {}", self.session_id);

        // Mark as inactive
        {
            let mut active = self.is_active.lock();
            *active = false;
        }

        // Kill child process
        {
            let mut child_guard = self.child_process.lock();
            if let Some(ref mut child) = *child_guard {
                if let Err(_) = child.kill() {
                    log::warn!("Failed to kill child process");
                }
                if let Err(e) = child.wait() {
                    log::warn!("Failed to wait for child process: {}", e);
                }
            }
        }

        Ok(())
    }

    /// Check if session is still active
    pub fn is_active(&self) -> bool {
        *self.is_active.lock()
    }

    /// Get working directory
    pub fn get_working_directory(&self) -> String {
        self.working_directory.lock().clone()
    }

    /// Get command history
    pub fn get_command_history(&self) -> Vec<String> {
        self.command_history.lock().clone()
    }

    /// Get current command
    pub fn get_current_command(&self) -> Option<String> {
        self.current_command.lock().clone()
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        if let Err(e) = self.terminate() {
            log::error!("Error terminating session during drop: {}", e);
        }
    }
}