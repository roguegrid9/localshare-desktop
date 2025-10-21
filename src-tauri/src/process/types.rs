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

    // Traffic detection
    pub service_type: Option<String>, // "http", "minecraft", "tcp", etc.
    pub protocol: Option<String>,      // "http", "tcp", "minecraft", etc.
}

// Shared Process with simplified data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedProcess {
    pub id: String,
    pub grid_id: String,
    pub user_id: String,
    pub device_id: String, // Unique device ID - identifies which computer owns this process
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

// ============================================================================
// New Types for Host/Guest Process Availability
// ============================================================================

/// Registration state for process sync with backend
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RegistrationState {
    Pending,      // Just started, registration in progress
    Registered,   // Successfully registered with backend
    Failed,       // Registration failed, will retry
    LocalOnly,    // Gave up on registration, process is local-only
}

/// Grid-level process status (what's available in the grid)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GridProcessStatus {
    Hosted,    // Process is being hosted by someone
    Orphaned,  // Host disconnected, process needs new host
    Inactive,  // Process is not running anywhere
}

/// Local process status (what's happening on THIS machine)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LocalProcessStatus {
    Hosting,    // This machine is hosting the process
    Connected,  // Connected to remote host as guest
    Available,  // Available to connect (hosted elsewhere)
    Unavailable, // Not available (no active host)
}

/// Complete process availability information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessAvailability {
    pub process_id: String,
    pub grid_id: String,

    // Grid-level state
    pub grid_status: GridProcessStatus,
    pub host_user_id: Option<String>,
    pub host_display_name: Option<String>,
    pub host_device_id: Option<String>,  // Device ID of the host computer
    pub active_connections: u32,

    // Local state
    pub local_status: LocalProcessStatus,
    pub local_port: Option<u16>,  // If connected/hosting, which local port

    // Connection metadata
    pub connection_id: Option<String>,  // If connected as guest
    pub is_connectable: bool,
    pub last_heartbeat_at: Option<String>,  // Changed from u64 to String to match backend timestamp format
}

/// Process registration retry state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistrationRetry {
    pub attempt: u32,
    pub max_attempts: u32,
    pub next_retry_at: u64, // Unix timestamp
}

/// Extended process info with availability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedProcessInfo {
    #[serde(flatten)]
    pub process_info: ProcessInfo,
    pub availability: ProcessAvailability,
    pub registration_state: RegistrationState,
    pub registration_retry: Option<RegistrationRetry>,
}

impl Default for ProcessAvailability {
    fn default() -> Self {
        Self {
            process_id: String::new(),
            grid_id: String::new(),
            grid_status: GridProcessStatus::Inactive,
            host_user_id: None,
            host_display_name: None,
            host_device_id: None,
            active_connections: 0,
            local_status: LocalProcessStatus::Unavailable,
            local_port: None,
            connection_id: None,
            is_connectable: false,
            last_heartbeat_at: None,
        }
    }
}

impl std::fmt::Display for LocalProcessStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LocalProcessStatus::Hosting => write!(f, "hosting"),
            LocalProcessStatus::Connected => write!(f, "connected"),
            LocalProcessStatus::Available => write!(f, "available"),
            LocalProcessStatus::Unavailable => write!(f, "unavailable"),
        }
    }
}

impl std::fmt::Display for GridProcessStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GridProcessStatus::Hosted => write!(f, "hosted"),
            GridProcessStatus::Orphaned => write!(f, "orphaned"),
            GridProcessStatus::Inactive => write!(f, "inactive"),
        }
    }
}

impl std::fmt::Display for RegistrationState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RegistrationState::Pending => write!(f, "pending"),
            RegistrationState::Registered => write!(f, "registered"),
            RegistrationState::Failed => write!(f, "failed"),
            RegistrationState::LocalOnly => write!(f, "local_only"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_config_new_creates_config_with_executable_path() {
        let config = ProcessConfig::new("/usr/bin/node".to_string());

        assert_eq!(config.executable_path, "/usr/bin/node");
        assert_eq!(config.args.len(), 0);
        assert_eq!(config.env_vars.len(), 0);
        assert!(!config.working_directory.is_empty());
    }

    #[test]
    fn test_process_config_with_args_adds_arguments() {
        let config = ProcessConfig::new("/usr/bin/node".to_string())
            .with_args(vec!["server.js".to_string(), "--port".to_string(), "3000".to_string()]);

        assert_eq!(config.args.len(), 3);
        assert_eq!(config.args[0], "server.js");
        assert_eq!(config.args[1], "--port");
        assert_eq!(config.args[2], "3000");
    }

    #[test]
    fn test_process_config_with_env_var_adds_environment_variable() {
        let config = ProcessConfig::new("/usr/bin/node".to_string())
            .with_env_var("NODE_ENV".to_string(), "production".to_string())
            .with_env_var("PORT".to_string(), "8080".to_string());

        assert_eq!(config.env_vars.len(), 2);
        assert_eq!(config.env_vars.get("NODE_ENV"), Some(&"production".to_string()));
        assert_eq!(config.env_vars.get("PORT"), Some(&"8080".to_string()));
    }

    #[test]
    fn test_process_config_validate_rejects_empty_executable_path() {
        let config = ProcessConfig::new("".to_string());

        let result = config.validate();
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Executable path cannot be empty");
    }

    #[test]
    fn test_process_config_validate_accepts_internal_process_types() {
        let configs = vec![
            ProcessConfig::new("internal_discovered_process".to_string()),
            ProcessConfig::new("internal_terminal".to_string()),
            ProcessConfig::new("internal_port_forward".to_string()),
        ];

        for config in configs {
            let result = config.validate();
            assert!(result.is_ok(), "Internal process type should be valid: {}", config.executable_path);
        }
    }
}
