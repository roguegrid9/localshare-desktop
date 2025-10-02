// src-tauri/src/terminal/mod.rs
pub mod manager;
pub mod session;
pub mod shell;
pub mod types;
pub mod name_generator;

// Re-export only what's actually used
pub use manager::TerminalManager;

