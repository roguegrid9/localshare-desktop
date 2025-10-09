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

// Update display name for authenticated users
#[tauri::command]
pub async fn update_display_name(display_name: String) -> Result<(), String> {
    log::info!("Tauri command: update_display_name called");
    log::info!("New display name: {}", display_name);

    crate::auth::update_user_display_name(display_name)
        .await
        .map_err(|e| {
            log::error!("Failed to update display name: {}", e);
            e.to_string()
        })
}

// Accept Terms of Service for authenticated users
#[tauri::command]
pub async fn accept_tos(tos_version: String) -> Result<(), String> {
    log::info!("Tauri command: accept_tos called");
    log::info!("TOS version: {}", tos_version);

    crate::auth::accept_tos(tos_version)
        .await
        .map_err(|e| {
            log::error!("Failed to accept TOS: {}", e);
            e.to_string()
        })
}

// Get current user information
#[tauri::command]
pub async fn get_current_user() -> Result<crate::api::CurrentUserResponse, String> {
    log::info!("Tauri command: get_current_user called");

    crate::auth::get_current_user_info()
        .await
        .map_err(|e| {
            log::error!("Failed to get current user: {}", e);
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

// Custom OAuth callback HTML response
const OAUTH_SUCCESS_HTML: &str = r#"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful - RogueGrid9</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0B0D10;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            background: #111319;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 48px 40px;
            max-width: 440px;
            width: 100%;
            text-align: center;
        }

        .logo {
            width: 48px;
            height: 48px;
            margin: 0 auto 24px;
            background: linear-gradient(135deg, #FF8A00 0%, #FF3D00 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: scaleIn 0.3s ease-out;
        }

        .logo svg {
            width: 28px;
            height: 28px;
            color: white;
        }

        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            color: white;
            animation: fadeInUp 0.4s ease-out 0.1s both;
        }

        p {
            font-size: 15px;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.6;
            margin-bottom: 32px;
            animation: fadeInUp 0.4s ease-out 0.2s both;
        }

        .status-box {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            animation: fadeInUp 0.4s ease-out 0.3s both;
        }

        .status-box .icon {
            display: inline-block;
            margin-right: 8px;
        }

        .status-box .message {
            color: rgba(34, 197, 94, 0.9);
            font-size: 14px;
            font-weight: 500;
        }

        .instructions {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 24px;
            animation: fadeInUp 0.4s ease-out 0.4s both;
        }

        .close-button {
            width: 100%;
            padding: 12px 24px;
            background: linear-gradient(135deg, #FF8A00 0%, #FF3D00 100%);
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
            animation: fadeInUp 0.4s ease-out 0.5s both;
        }

        .close-button:hover {
            opacity: 0.9;
        }

        @keyframes scaleIn {
            from {
                transform: scale(0);
                opacity: 0;
            }
            to {
                transform: scale(1);
                opacity: 1;
            }
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
        </div>

        <h1>Successfully Authenticated</h1>

        <p>
            You're all set! Return to RogueGrid9 to continue.
        </p>

        <div class="status-box">
            <span class="icon">✓</span>
            <span class="message">Authentication complete</span>
        </div>

        <div class="instructions">
            You can safely close this window or it will close automatically.
        </div>

        <button class="close-button" onclick="tryClose()">Close Window</button>
    </div>

    <script>
        // Try multiple methods to close the window
        function tryClose() {
            // Method 1: Standard close
            window.close();

            // Method 2: If still open after 100ms, try alternative
            setTimeout(() => {
                if (!window.closed) {
                    // Try to close with opener
                    if (window.opener) {
                        window.opener = null;
                        window.close();
                    }

                    // If still can't close, navigate away
                    setTimeout(() => {
                        if (!window.closed) {
                            window.location = 'about:blank';
                        }
                    }, 100);
                }
            }, 100);
        }

        // Auto-close after 3 seconds
        setTimeout(() => {
            tryClose();
        }, 3000);

        // Also try to close when user clicks anywhere
        document.addEventListener('click', tryClose);
    </script>
</body>
</html>
"#;

// Start OAuth callback server and return the port
#[tauri::command]
pub async fn start_oauth_server(window: tauri::Window) -> Result<u16, String> {
    use tauri::Emitter;
    use tiny_http::{Server, Response};
    use tokio::task;

    log::info!("Tauri command: start_oauth_server called");

    // Find an available port
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind to port: {}", e))?;

    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();

    drop(listener); // Release the port for tiny_http

    log::info!("Starting OAuth server on port {}", port);

    // Start HTTP server in background
    task::spawn_blocking(move || {
        let server = match Server::http(format!("127.0.0.1:{}", port)) {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to start OAuth HTTP server: {}", e);
                return;
            }
        };

        log::info!("OAuth callback server listening on port {}", port);

        // Handle only one request (the OAuth callback)
        if let Ok(Some(request)) = server.recv_timeout(std::time::Duration::from_secs(300)) {
            let url = format!("http://localhost:{}{}", port, request.url());
            log::info!("OAuth callback received: {}", url);

            // Send success HTML response
            let response = Response::from_string(OAUTH_SUCCESS_HTML)
                .with_header(
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap()
                );

            if let Err(e) = request.respond(response) {
                log::error!("Failed to send OAuth response: {}", e);
            }

            // Emit the callback URL to the frontend
            if let Err(e) = window.emit("oauth-callback", url) {
                log::error!("Failed to emit OAuth callback event: {}", e);
            }
        }

        log::info!("OAuth callback server stopped");
    });

    Ok(port)
}