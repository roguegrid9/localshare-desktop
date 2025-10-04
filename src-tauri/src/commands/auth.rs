use crate::auth::{acquire_provisional_token, clear_current_session, promote_provisional_account};
use crate::api::{UserState, UserSessionResult, PromotionRequest, PromotionResponse, ConnectionStatus};
use crate::state::{get_current_user_state, check_coordinator_connection};
use crate::api::CheckUsernameAvailabilityResponse;
use crate::auth::create_authenticated_session_from_oauth;

// Guest accounts are now "backend-only" but still available
#[tauri::command]
pub async fn create_guest_session(
    user_handle: String,
    display_name: String,
) -> Result<UserSessionResult, String> {
    log::info!("Tauri command: create_guest_session called (backend-only)");
    log::info!("User handle: {}, Display name: {}", user_handle, display_name);
    
    acquire_provisional_token(user_handle, display_name)
        .await
        .map_err(|e| {
            log::error!("Failed to create guest session: {}", e);
            e.to_string()
        })
}

// DEPRECATED: Keep for backwards compatibility but point to guest
#[tauri::command]
pub async fn initialize_user_session(
    user_handle: String,
    display_name: String,
) -> Result<UserSessionResult, String> {
    log::info!("Tauri command: initialize_user_session called (redirecting to guest)");
    create_guest_session(user_handle, display_name).await
}

#[tauri::command]
pub async fn get_user_state() -> Result<UserState, String> {
    log::info!("Tauri command: get_user_state called");
    
    get_current_user_state()
        .await
        .map_err(|e| {
            log::error!("Failed to get user state: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn promote_account(request: PromotionRequest) -> Result<PromotionResponse, String> {
    log::info!("Tauri command: promote_account called");
    
    promote_provisional_account(request.supabase_access_token)
        .await
        .map_err(|e| {
            log::error!("Failed to promote account: {}", e);
            e.to_string()
        })
}

// Promote account with just the token (simpler interface)
#[tauri::command]
pub async fn promote_account_simple(supabase_access_token: String) -> Result<PromotionResponse, String> {
    log::info!("Tauri command: promote_account_simple called");
    
    // First check if we have an existing session to promote
    match get_current_user_state().await {
        Ok(user_state) if user_state.is_provisional => {
            // We have an existing provisional session, use the normal promotion
            log::info!("Found existing provisional session, promoting normally");
            promote_provisional_account(supabase_access_token)
                .await
                .map_err(|e| {
                    log::error!("Failed to promote existing account: {}", e);
                    e.to_string()
                })
        },
        _ => {
            // No existing session or not provisional, create a new authenticated session from OAuth
            log::info!("No existing provisional session found, creating new authenticated session from OAuth");
            create_authenticated_session_from_oauth(supabase_access_token)
                .await
                .map_err(|e| {
                    log::error!("Failed to create authenticated session from OAuth: {}", e);
                    e.to_string()
                })
        }
    }
}

#[tauri::command]
pub async fn clear_user_session() -> Result<(), String> {
    log::info!("Tauri command: clear_user_session called");
    
    clear_current_session()
        .await
        .map_err(|e| {
            log::error!("Failed to clear user session: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn check_connection_status() -> Result<ConnectionStatus, String> {
    log::info!("Tauri command: check_connection_status called");
    
    check_coordinator_connection()
        .await
        .map_err(|e| {
            log::error!("Failed to check connection status: {}", e);
            e.to_string()
        })
}

#[tauri::command]
pub async fn validate_token() -> Result<bool, String> {
    log::info!("Tauri command: validate_token called");
    
    let state = get_current_user_state().await
        .map_err(|e| {
            log::error!("Failed to validate token: {}", e);
            e.to_string()
        })?;
    
    // Check if we have any valid session (anonymous, guest, or authenticated)
    Ok(state.is_authenticated || state.is_provisional)
}

// Check for existing Supabase session and auto-promote
#[tauri::command]
pub async fn check_supabase_session() -> Result<Option<String>, String> {
    log::info!("Tauri command: check_supabase_session called");
    
    // This would be called from frontend after OAuth redirect
    // The frontend will pass the session token if found
    Ok(None)
}

// Initialize storage on app start
#[tauri::command]
pub async fn initialize_app_storage() -> Result<(), String> {
    log::info!("Tauri command: initialize_app_storage called");
    
    crate::auth::initialize_storage();
    log::info!("App storage initialized successfully");
    Ok(())
}

// Update username for authenticated users
#[tauri::command]
pub async fn update_username(username: String) -> Result<(), String> {
    log::info!("Tauri command: update_username called");
    log::info!("New username: {}", username);
    
    crate::auth::update_user_username(username)
        .await
        .map_err(|e| {
            log::error!("Failed to update username: {}", e);
            e.to_string()
        })
}

// Check if username is available
#[tauri::command]
pub async fn check_username_availability(username: String) -> Result<CheckUsernameAvailabilityResponse, String> {
    log::info!("Tauri command: check_username_availability called");
    log::info!("Checking username: {}", username);
    
    crate::auth::check_username_availability(username)
        .await
        .map_err(|e| {
            log::error!("Failed to check username availability: {}", e);
            e.to_string()
        })
}

// Promote account with optional username
#[tauri::command]
pub async fn promote_account_with_username(
    supabase_access_token: String,
    username: Option<String>
) -> Result<crate::api::PromotionResponse, String> {
    log::info!("Tauri command: promote_account_with_username called");
    if let Some(ref u) = username {
        log::info!("With username: {}", u);
    }

    crate::auth::promote_account_with_username(supabase_access_token, username)
        .await
        .map_err(|e| {
            log::error!("Failed to promote account with username: {}", e);
            e.to_string()
        })
}

// Get the stored authentication token (RogueGrid JWT)
#[tauri::command]
pub async fn get_auth_token() -> Result<String, String> {
    log::info!("Tauri command: get_auth_token called");

    crate::auth::get_stored_token()
        .await
        .map_err(|e| {
            log::error!("Failed to get auth token: {}", e);
            e.to_string()
        })
}

// Start OAuth callback server and return the port
#[tauri::command]
pub async fn start_oauth_server(window: tauri::Window) -> Result<u16, String> {
    use tauri::Emitter;
    log::info!("Tauri command: start_oauth_server called");

    tauri_plugin_oauth::start(move |url| {
        log::info!("OAuth callback received: {}", url);

        // Emit the callback URL to the frontend
        if let Err(e) = window.emit("oauth-callback", url.clone()) {
            log::error!("Failed to emit OAuth callback event: {}", e);
        }
    })
    .map_err(|e| {
        log::error!("Failed to start OAuth server: {}", e);
        e.to_string()
    })
}