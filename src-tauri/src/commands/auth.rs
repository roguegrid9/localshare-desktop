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
    let result = match get_current_user_state().await {
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
    };

    // If authentication succeeded, cleanup stale tunnels
    if result.is_ok() {
        log::info!("Authentication successful, cleaning up stale tunnels");
        tokio::spawn(async {
            if let Err(e) = cleanup_stale_tunnels().await {
                log::error!("Failed to cleanup stale tunnels after authentication: {}", e);
            }
        });
    }

    result
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
    <title>Authentication Successful - RogueGrid</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #000000;
            color: #E9ECF3;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            overflow: hidden;
        }

        .container {
            position: relative;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(122, 140, 171, 0.25);
            box-shadow:
                0 8px 32px 0 rgba(0, 0, 0, 0.37),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.1),
                0 0 0 1px rgba(58, 175, 255, 0.1);
            border-radius: 10px;
            padding: 48px 40px;
            max-width: 440px;
            width: 100%;
            text-align: center;
        }

        .logo {
            width: 56px;
            height: 56px;
            margin: 0 auto 24px;
            background: linear-gradient(135deg, #3AAFFF 0%, #7B5CFF 100%);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow:
                0 0 0 1px rgba(58, 175, 255, 0.3),
                0 0 20px rgba(123, 92, 255, 0.5),
                0 4px 16px rgba(0, 0, 0, 0.3);
            animation: scaleIn 0.4s ease-out, pulse 2s ease-in-out infinite;
        }

        .logo svg {
            width: 32px;
            height: 32px;
            color: white;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }

        h1 {
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 8px;
            color: #E9ECF3;
            animation: fadeInUp 0.4s ease-out 0.1s both;
        }

        p {
            font-size: 15px;
            font-weight: 400;
            color: #A4ACB9;
            line-height: 1.5;
            margin-bottom: 32px;
            animation: fadeInUp 0.4s ease-out 0.2s both;
        }

        .status-box {
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            animation: fadeInUp 0.4s ease-out 0.3s both;
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
        }

        .status-box .icon {
            display: inline-block;
            margin-right: 8px;
            font-size: 16px;
            color: #10B981;
        }

        .status-box .message {
            color: #10B981;
            font-size: 14px;
            font-weight: 500;
        }

        .instructions {
            font-size: 13px;
            color: #80889B;
            margin-bottom: 24px;
            animation: fadeInUp 0.4s ease-out 0.4s both;
        }

        .close-button {
            width: 100%;
            padding: 12px 24px;
            background: linear-gradient(135deg, #3AAFFF 0%, #7B5CFF 100%);
            border: none;
            border-radius: 8px;
            color: white;
            font-family: 'Inter', sans-serif;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            animation: fadeInUp 0.4s ease-out 0.5s both;
            box-shadow:
                0 0 0 1px rgba(58, 175, 255, 0.3),
                0 4px 12px rgba(123, 92, 255, 0.4);
        }

        .close-button:hover {
            transform: scale(1.02);
            box-shadow:
                0 0 0 1px rgba(58, 175, 255, 0.5),
                0 0 20px rgba(123, 92, 255, 0.6),
                0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .close-button:active {
            transform: scale(0.98);
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

        @keyframes pulse {
            0%, 100% {
                box-shadow:
                    0 0 0 1px rgba(58, 175, 255, 0.3),
                    0 0 20px rgba(123, 92, 255, 0.5),
                    0 4px 16px rgba(0, 0, 0, 0.3);
            }
            50% {
                box-shadow:
                    0 0 0 1px rgba(58, 175, 255, 0.5),
                    0 0 30px rgba(123, 92, 255, 0.7),
                    0 4px 20px rgba(0, 0, 0, 0.4);
            }
        }

        /* Ambient glow orb in background */
        .orb {
            position: absolute;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            filter: blur(80px);
            pointer-events: none;
            opacity: 0.2;
            z-index: -1;
        }

        .orb-1 {
            top: -150px;
            right: -150px;
            background: radial-gradient(
                circle at center,
                rgba(58, 175, 255, 0.6) 0%,
                rgba(58, 175, 255, 0.2) 50%,
                transparent 70%
            );
        }

        .orb-2 {
            bottom: -150px;
            left: -150px;
            background: radial-gradient(
                circle at center,
                rgba(123, 92, 255, 0.55) 0%,
                rgba(123, 92, 255, 0.18) 50%,
                transparent 70%
            );
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>

        <div class="logo">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
        </div>

        <h1>Successfully Authenticated</h1>

        <p>
            You're all set! Return to RogueGrid to continue.
        </p>

        <div class="status-box">
            <span class="icon">✓</span>
            <span class="message">Authentication complete</span>
        </div>

        <div class="instructions">
            This window will close automatically in a moment.
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

        // Auto-close after 2 seconds (reduced from 3)
        setTimeout(() => {
            tryClose();
        }, 2000);

        // Also try to close when user clicks anywhere
        document.addEventListener('click', tryClose);
    </script>
</body>
</html>
"#;

// Cleanup stale tunnels after authentication
#[tauri::command]
pub async fn cleanup_stale_tunnels() -> Result<usize, String> {
    log::info!("Tauri command: cleanup_stale_tunnels called");

    // Get the authentication token
    let session = match crate::auth::storage::get_user_session().await {
        Ok(Some(session)) => session,
        Ok(None) => {
            log::warn!("No user session available for tunnel cleanup");
            return Ok(0);
        },
        Err(e) => {
            log::error!("Failed to get user session for tunnel cleanup: {}", e);
            return Ok(0);
        }
    };

    // Create coordinator client
    let coordinator_client = crate::api::client::CoordinatorClient::new();

    // Delete all tunnels
    match coordinator_client.delete_all_tunnels(&session.token).await {
        Ok(count) => {
            if count > 0 {
                log::info!("Cleaned up {} stale tunnel(s) - FRP will reconnect automatically", count);
            } else {
                log::info!("No stale tunnels to clean up");
            }
            Ok(count)
        },
        Err(e) => {
            log::error!("Failed to cleanup stale tunnels: {}", e);
            Ok(0)
        }
    }
}

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