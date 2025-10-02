use std::sync::Arc;
use tokio::sync::Mutex;
use crate::windows::WindowManager;

/// Window management state that gets added to AppState
pub type WindowManagerState = Arc<Mutex<Option<WindowManager>>>;
