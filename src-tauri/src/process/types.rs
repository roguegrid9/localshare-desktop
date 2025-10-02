use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Configuration for a process to be spawned
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessConfig {
    pub executable_path: String,
    pub args: Vec<String>,
    pub env_vars: HashMap<String, String>,
    pub working_directory: String,
}

// Current state of a process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessState {
    Inactive,   // No process running
    Starting,   // Process is being spawned
    Running,    // Process is active
    Stopping,   // Process is being terminated
    Stopped,    // Process was manually stopped
    Exited,     // Process exited (with or without error)
    Failed,     // Process failed to start or crashed
}

// Status information for a process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStatus {
    pub process_id: String,
    pub grid_id: String,
    pub state: ProcessState,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
    pub started_at: u64, // Unix timestamp
    pub error_message: Option<String>,
}

// Simple process type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProcessType {
    Terminal,
    Network,
    Unknown,
}

// Complete information about a managed process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub process_id: String,
    pub grid_id: String,
    pub config: ProcessConfig,
    pub status: ProcessStatus,
    pub created_at: u64, // Unix timestamp
    pub process_type: ProcessType,
}

// Events emitted by the process manager
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEvent {
    pub event_type: ProcessEventType,
    pub grid_id: String,
    pub process_id: String,
    pub data: Option<serde_json::Value>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessEventType {
    Started,
    Stopped,
    Exited,
    Failed,
    StdoutData,
    StderrData,
    StateChanged,
}

impl Default for ProcessConfig {
    fn default() -> Self {
        Self {
            executable_path: String::new(),
            args: Vec::new(),
            env_vars: HashMap::new(),
            working_directory: std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
        }
    }
}

impl ProcessConfig {
    pub fn new(executable_path: String) -> Self {
        Self {
            executable_path,
            ..Default::default()
        }
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = args;
        self
    }

    pub fn with_env_var(mut self, key: String, value: String) -> Self {
        self.env_vars.insert(key, value);
        self
    }

    pub fn with_working_directory(mut self, working_directory: String) -> Self {
        self.working_directory = working_directory;
        self
    }

    // Validate the configuration before spawning
    pub fn validate(&self) -> Result<(), String> {
        if self.executable_path.is_empty() {
            return Err("Executable path cannot be empty".to_string());
        }

        // Skip validation for special internal process types
        if self.executable_path == "internal_discovered_process" ||
        self.executable_path == "internal_terminal" ||
        self.executable_path == "internal_port_forward" {
            return Ok(()); // These don't need file validation
        }

        if !std::path::Path::new(&self.executable_path).exists() {
            return Err(format!("Executable not found: {}", self.executable_path));
        }

        if !self.working_directory.is_empty() && !std::path::Path::new(&self.working_directory).exists() {
            return Err(format!("Working directory not found: {}", self.working_directory));
        }

        Ok(())
    }
}

impl std::fmt::Display for ProcessState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProcessState::Inactive => write!(f, "inactive"),
            ProcessState::Starting => write!(f, "starting"),
            ProcessState::Running => write!(f, "running"),
            ProcessState::Stopping => write!(f, "stopping"),
            ProcessState::Stopped => write!(f, "stopped"),
            ProcessState::Exited => write!(f, "exited"),
            ProcessState::Failed => write!(f, "failed"),
        }
    }
}
// Simple Process Configuration for MVP
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleProcessConfig {
    // User-defined
    pub name: String,
    pub description: Option<String>,
    
    // Process details (from discovery)
    pub pid: u32,
    pub port: u16,
    pub command: String,
    pub working_dir: String,
    pub executable_path: String,
    pub process_name: String,
}

// Shared Process with simplified data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedProcess {
    pub id: String,
    pub grid_id: String,
    pub user_id: String,
    pub config: SimpleProcessConfig,
    pub status: SharedProcessStatus,
    pub last_seen_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SharedProcessStatus {
    Running,
    Stopped,
    Error,
}

impl ProcessInfo {
    pub fn get_display_name(&self) -> String {
        // For terminal processes, use the terminal name from args or env vars
        if self.config.executable_path == "internal_terminal" {
            // Try to get name from args (third argument)
            if self.config.args.len() >= 3 {
                return self.config.args[2].clone();
            }
            
            // Try to get name from environment variables
            if let Some(name) = self.config.env_vars.get("TERMINAL_NAME") {
                return name.clone();
            }
            
            // Fallback to process ID
            return format!("Terminal {}", &self.process_id[0..8]);
        }
        
        // For other processes, use the process ID
        self.process_id.clone()
    }
}
