use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandValidation {
    pub is_valid: bool,
    pub executable: String,
    pub args: Vec<String>,
    pub detected_port: Option<u16>,
    pub suggestion: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalProcessConfig {
    pub command: String,
    pub working_directory: Option<String>,
    pub executable: String,
    pub args: Vec<String>,
    pub detected_port: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandTemplate {
    pub name: String,
    pub command: String,
    pub description: String,
    pub category: String,
    pub default_port: Option<u16>,
}
