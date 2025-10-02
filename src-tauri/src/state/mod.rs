pub mod app;
pub mod user;
pub mod codes;
pub mod windows;

// Re-export the existing functions for backward compatibility
pub use user::{get_current_user_state, check_coordinator_connection};
pub use codes::CodeState;