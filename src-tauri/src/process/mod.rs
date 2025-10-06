// src-tauri/src/process/mod.rs

pub mod types;
pub mod manager;
pub mod port_detection;
pub mod discovered_monitor;
pub mod terminal_process;

pub use manager::ProcessManager;
pub use terminal_process::TerminalProcessBridge;
pub use types::{ProcessConfig, ProcessStatus, ProcessInfo, ProcessState};
