use crate::grids::GridsService;
use crate::p2p::P2PManager;
use crate::process::ProcessManager;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::terminal::TerminalManager;
use crate::state::codes::CodeState;
use crate::transport::TransportManager;
use crate::codes::ResourceCodesService;
use std::collections::HashMap;
use crate::messaging::MessagingService;
use crate::state::windows::WindowManagerState;
use crate::media::MediaManager;
use crate::discovery::Discovery;
use crate::process::types::SharedProcess;
use crate::share::{ShareManager, ShareConnectionManager};

// User state structure
#[derive(Debug, Clone)]
pub struct UserState {
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub is_authenticated: bool,
}

// Enhanced application state
pub struct AppState {
    pub grids_service: Arc<Mutex<Option<GridsService>>>,
    pub p2p_manager: Arc<Mutex<Option<P2PManager>>>,
    pub process_manager: Arc<Mutex<Option<ProcessManager>>>,
    pub transport_manager: Arc<Mutex<Option<TransportManager>>>,
    pub code_state: Arc<Mutex<CodeState>>,
    pub codes_service: Arc<Mutex<Option<ResourceCodesService>>>,
    pub terminal_manager: Arc<Mutex<Option<TerminalManager>>>,
    pub messaging_service: Arc<Mutex<Option<MessagingService>>>,
    pub websocket_manager: Arc<Mutex<Option<crate::websocket::WebSocketManager>>>,
    pub window_manager: WindowManagerState,
    pub media_manager: Arc<Mutex<Option<MediaManager>>>,
    pub discovery_engine: Arc<Mutex<Option<Discovery>>>,
    pub share_manager: Arc<Mutex<Option<ShareManager>>>,
    pub share_connection_manager: Arc<Mutex<Option<ShareConnectionManager>>>,
    pub user: Arc<Mutex<UserState>>,
    pub shared_processes: Arc<Mutex<HashMap<String, SharedProcess>>>,
    pub auth_token: Arc<Mutex<Option<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            grids_service: Arc::new(Mutex::new(None)),
            p2p_manager: Arc::new(Mutex::new(None)),
            process_manager: Arc::new(Mutex::new(None)),
            transport_manager: Arc::new(Mutex::new(None)),
            code_state: Arc::new(Mutex::new(CodeState::new())),
            codes_service: Arc::new(Mutex::new(None)),
            terminal_manager: Arc::new(Mutex::new(None)),
            messaging_service: Arc::new(Mutex::new(None)),
            websocket_manager: Arc::new(Mutex::new(None)),
            window_manager: Arc::new(Mutex::new(None)),
            media_manager: Arc::new(Mutex::new(None)),
            discovery_engine: Arc::new(Mutex::new(None)),
            share_manager: Arc::new(Mutex::new(Some(ShareManager::new()))),
            share_connection_manager: Arc::new(Mutex::new(Some(ShareConnectionManager::new()))),
            user: Arc::new(Mutex::new(UserState {
                user_id: None,
                username: None,
                is_authenticated: false,
            })),
            shared_processes: Arc::new(Mutex::new(HashMap::new())),
            auth_token: Arc::new(Mutex::new(None)),
        }
    }
}