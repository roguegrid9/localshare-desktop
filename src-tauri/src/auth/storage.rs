use crate::api::{UserState, UserSessionResult};
use anyhow::{Result, Context};
use crate::auth::{parse_jwt_claims, is_token_expired};
use serde_json;
use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};

// Separate storage for different account types
static PERSISTENT_STORAGE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static ANONYMOUS_STORAGE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static INITIALIZED: AtomicBool = AtomicBool::new(false);

const USER_SESSION_KEY: &str = "user_session";
const USER_STATE_KEY: &str = "user_state";

#[derive(Debug, Clone)]
pub enum AccountType {
    Anonymous,  // Temporary, cleared on restart
    Guest,      // Backend-only, persistent
    Authenticated, // Full account, persistent
}

pub async fn store_user_session(session: &UserSessionResult, account_type: AccountType) -> Result<()> {
    let session_json = serde_json::to_string(session)
        .context("Failed to serialize user session")?;
    
    let storage = match account_type {
        AccountType::Anonymous => &ANONYMOUS_STORAGE,
        AccountType::Guest | AccountType::Authenticated => &PERSISTENT_STORAGE,
    };
    
    {
        let mut storage_guard = storage.lock()
            .map_err(|_| anyhow::anyhow!("Failed to acquire storage lock"))?;
        
        storage_guard.insert(USER_SESSION_KEY.to_string(), session_json);
        
        // Create user state (username will be fetched from server when needed)
        let user_state = UserState {
            is_authenticated: matches!(account_type, AccountType::Authenticated),
            is_provisional: matches!(account_type, AccountType::Guest | AccountType::Anonymous),
            user_id: Some(session.user_id.clone()),
            display_name: Some(session.display_name.clone()),
            username: None, // Will be fetched from server
            connection_status: "connected".to_string(),
            developer_handle: None,
            token_expires_at: Some(get_current_timestamp() + session.expires_in),
            account_type: Some(match account_type {
                AccountType::Anonymous => "anonymous".to_string(),
                AccountType::Guest => "guest".to_string(),
                AccountType::Authenticated => "authenticated".to_string(),
            }),
        };
        
        let state_json = serde_json::to_string(&user_state)
            .context("Failed to serialize user state")?;
        
        storage_guard.insert(USER_STATE_KEY.to_string(), state_json);
    }
    
    log::info!("User session stored successfully with type: {:?}", account_type);
    Ok(())
}

pub async fn get_user_session() -> Result<Option<UserSessionResult>> {
    // Check anonymous storage first, then persistent
    for storage in [&ANONYMOUS_STORAGE, &PERSISTENT_STORAGE] {
        let session_json = {
            let storage_guard = storage.lock()
                .map_err(|_| anyhow::anyhow!("Failed to acquire storage lock"))?;
            
            storage_guard.get(USER_SESSION_KEY).cloned()
        };
        
        if let Some(session_json) = session_json {
            let session: UserSessionResult = serde_json::from_str(&session_json)
                .context("Failed to deserialize user session")?;
            return Ok(Some(session));
        }
    }
    
    Ok(None)
}

pub async fn get_user_state() -> Result<UserState> {
    match get_user_session().await? {
        Some(session) => {
            // Parse JWT to get additional info
            let jwt_claims = parse_jwt_claims(&session.token)?;
            
            // Fetch username from server for authenticated users
            let username = if session.account_type == "authenticated" {
                match fetch_username_from_server(&session.token).await {
                    Ok(server_username) => {
                        log::info!("Fetched username from server: {:?}", server_username);
                        server_username
                    }
                    Err(e) => {
                        log::warn!("Failed to fetch username from server: {}", e);
                        None // No fallback to local storage anymore
                    }
                }
            } else {
                // For anonymous/guest users, don't fetch from server
                None
            };
            
            // Determine connection status
            let connection_status = if is_token_expired(jwt_claims.exp) {
                "disconnected"
            } else {
                "connected"
            };
            
            Ok(UserState {
                is_authenticated: session.account_type == "authenticated",
                is_provisional: session.account_type != "authenticated",
                user_id: Some(session.user_id),
                username,
                display_name: Some(session.display_name),
                developer_handle: jwt_claims.dev_handle,
                connection_status: connection_status.to_string(),
                token_expires_at: Some(jwt_claims.exp),
                account_type: Some(session.account_type),
            })
        }
        None => Ok(UserState {
            is_authenticated: false,
            is_provisional: false,
            user_id: None,
            username: None,
            display_name: None,
            developer_handle: None,
            connection_status: "disconnected".to_string(),
            token_expires_at: None,
            account_type: None,
        }),
    }
}

// Fetch username from server - single source of truth
async fn fetch_username_from_server(token: &str) -> Result<Option<String>> {
    use crate::api::CoordinatorClient;
    
    let client = CoordinatorClient::new();
    
    match client.get_current_user(token).await {
        Ok(user_info) => Ok(user_info.username),
        Err(e) => {
            log::warn!("Could not fetch username from server: {}", e);
            Err(e)
        }
    }
}

/// Update username - simplified to just log since server is source of truth
pub async fn update_stored_username(user_id: &str, new_username: &str) -> Result<()> {
    // The username update should only happen on the server via the API
    // Local storage no longer needed since we fetch from server
    log::info!("Username update completed on server for user {}: {}", user_id, new_username);
    Ok(())
}

pub fn initialize_storage() {
    // Only clear anonymous storage on first initialization
    if !INITIALIZED.swap(true, Ordering::SeqCst) {
        if let Ok(mut storage) = ANONYMOUS_STORAGE.lock() {
            storage.clear();
            log::info!("Anonymous storage cleared on app start");
        }
    } else {
        log::info!("Storage already initialized, skipping anonymous clear");
    }
}

pub async fn clear_user_session() -> Result<()> {
    // Clear both storages
    for storage in [&ANONYMOUS_STORAGE, &PERSISTENT_STORAGE] {
        let mut storage_guard = storage.lock()
            .map_err(|_| anyhow::anyhow!("Failed to acquire storage lock"))?;
        
        storage_guard.remove(USER_SESSION_KEY);
        storage_guard.remove(USER_STATE_KEY);
    }
    
    log::info!("User session and state cleared from all storage");
    Ok(())
}

pub async fn clear_anonymous_session() -> Result<()> {
    {
        let mut storage = ANONYMOUS_STORAGE.lock()
            .map_err(|_| anyhow::anyhow!("Failed to acquire storage lock"))?;
        
        storage.clear();
    }
    
    log::info!("Anonymous session cleared");
    Ok(())
}

pub async fn update_connection_status(status: &str) -> Result<()> {
    let mut current_state = get_user_state().await?;
    current_state.connection_status = status.to_string();
    
    let state_json = serde_json::to_string(&current_state)
        .context("Failed to serialize updated user state")?;
    
    // Update in the appropriate storage
    let account_type = current_state.account_type.as_deref().unwrap_or("guest");
    let storage = if account_type == "anonymous" {
        &ANONYMOUS_STORAGE
    } else {
        &PERSISTENT_STORAGE
    };
    
    {
        let mut storage_guard = storage.lock()
            .map_err(|_| anyhow::anyhow!("Failed to acquire storage lock"))?;
        
        storage_guard.insert(USER_STATE_KEY.to_string(), state_json);
    }
    
    log::info!("Connection status updated to: {}", status);
    Ok(())
}

fn get_current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}