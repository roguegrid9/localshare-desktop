use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DetectedProcess {
    pub pid: u32,
    pub name: String,           // Process name from PID
    pub command: String,        // Full command line from PID
    pub working_dir: String,    // Working directory from PID
    pub port: u16,             // Listening port
    pub executable_path: String, // Path to executable from PID
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScanScope {
    Localhost,              // Default: 127.0.0.1, 0.0.0.0, ::1
    Network(String),        // Scan network range (e.g., "192.168.1.0/24")
    Docker,                 // Scan Docker containers
    CustomIP(String),       // User-specified IP address
}

impl Default for ScanScope {
    fn default() -> Self {
        ScanScope::Localhost
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScanConfig {
    pub scope: ScanScope,
    pub timeout_ms: u64,    // Port scan timeout
}

impl Default for ScanConfig {
    fn default() -> Self {
        ScanConfig {
            scope: ScanScope::Localhost,
            timeout_ms: 1000,
        }
    }
}