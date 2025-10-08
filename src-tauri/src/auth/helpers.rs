use anyhow::{Result, Context, bail};
use crate::auth::storage::{get_user_session, update_stored_username};
use crate::api::{
    CoordinatorClient,
    UserSessionResult,
    CheckUsernameAvailabilityResponse,
    PromotionResponse,
    CurrentUserResponse
};
use crate::auth::storage::{store_user_session, AccountType};

pub async fn get_stored_token() -> Result<String> {
    let session = get_user_session()
        .await
        .context("Failed to get stored session")?;

    if let Some(session_data) = session {
        Ok(session_data.token)
    } else {
        anyhow::bail!("No stored token found")
    }
}

/// Update username for the current authenticated user
pub async fn update_user_username(new_username: String) -> Result<()> {
    // Get current session to verify user is authenticated
    let session = get_user_session().await?
        .ok_or_else(|| anyhow::anyhow!("No active user session"))?;

    // Only allow authenticated users to set usernames
    if session.account_type != "authenticated" {
        bail!("Username can only be set for authenticated accounts");
    }

    // Validate username format
    if new_username.len() < 3 || new_username.len() > 30 {
        bail!("Username must be 3-30 characters long");
    }

    if !new_username.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        bail!("Username can only contain letters, numbers, underscores, and dashes");
    }

    if new_username.starts_with('_') || new_username.starts_with('-') ||
       new_username.ends_with('_') || new_username.ends_with('-') {
        bail!("Username cannot start or end with underscore or dash");
    }

    // Check availability with server
    let availability = check_username_availability(new_username.clone()).await?;
    if !availability.available {
        bail!("Username is not available: {}", availability.message);
    }

    // Try to update on server first
    let coordinator = CoordinatorClient::new();
    coordinator.update_username(&session.token, new_username.clone()).await
        .context("Failed to update username on server")?;

    // If server update succeeds, update local storage
    update_stored_username(&session.user_id, &new_username).await
        .context("Failed to update username in local storage")?;

    log::info!("Username successfully updated to: {}", new_username);
    Ok(())
}

/// Check if a username is available
pub async fn check_username_availability(username: String) -> Result<CheckUsernameAvailabilityResponse> {
    // Basic client-side validation first
    if username.len() < 3 {
        return Ok(CheckUsernameAvailabilityResponse {
            available: false,
            message: "Username must be at least 3 characters long".to_string(),
        });
    }

    if username.len() > 30 {
        return Ok(CheckUsernameAvailabilityResponse {
            available: false,
            message: "Username must be no more than 30 characters long".to_string(),
        });
    }

    if !username.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Ok(CheckUsernameAvailabilityResponse {
            available: false,
            message: "Username can only contain letters, numbers, underscores, and dashes".to_string(),
        });
    }

    // Check with server
    let coordinator = CoordinatorClient::new();
    log::info!("Checking username availability with server: {}", username);

    match coordinator.check_username_availability(username.clone()).await {
        Ok(response) => {
            log::info!("Username '{}' availability: {}", username, response.available);
            Ok(response)
        }
        Err(e) => {
            log::warn!("Failed to check username availability for '{}': {}. Assuming available for now - server will validate on update.", username, e);
            // If the server check fails (timeout, network error, etc), assume available
            // The server will do the final validation when the username is actually set
            Ok(CheckUsernameAvailabilityResponse {
                available: true,
                message: format!("Could not verify availability ({}), but you can try it", e),
            })
        }
    }
}

/// Update user display name
pub async fn update_user_display_name(new_display_name: String) -> Result<()> {
    // Get current session
    let session = get_user_session().await?
        .ok_or_else(|| anyhow::anyhow!("No active user session"))?;

    // Validate display name
    if new_display_name.trim().is_empty() || new_display_name.len() > 50 {
        bail!("Display name must be 1-50 characters long");
    }

    // Update on server
    let coordinator = CoordinatorClient::new();
    coordinator.update_display_name(&session.token, new_display_name.clone()).await
        .context("Failed to update display name on server")?;

    log::info!("Display name successfully updated");
    Ok(())
}

/// Get current user information from server
pub async fn get_current_user_info() -> Result<CurrentUserResponse> {
    // Get current session
    let session = get_user_session().await?
        .ok_or_else(|| anyhow::anyhow!("No active user session"))?;

    // Fetch from server
    let coordinator = CoordinatorClient::new();
    coordinator.get_current_user(&session.token).await
        .context("Failed to get current user info from server")
}

/// Promote account with optional username
pub async fn promote_account_with_username(
    supabase_access_token: String,
    username: Option<String>
) -> Result<PromotionResponse> {
    // First do the normal account promotion
    let promotion_result = crate::auth::promote_provisional_account(supabase_access_token).await?;

    // If username is provided, try to set it
    if let Some(username) = username {
        match update_user_username(username.clone()).await {
            Ok(()) => {
                log::info!("Username set successfully during account promotion");
            },
            Err(e) => {
                // Don't fail the entire promotion if username setting fails
                log::warn!("Failed to set username during promotion: {}", e);
            }
        }
    }

    Ok(promotion_result)
}

/// Create authenticated session directly from OAuth token (no existing session required)
pub async fn create_authenticated_session_from_oauth(
    supabase_access_token: String
) -> Result<PromotionResponse> {
    log::info!("Creating authenticated session from OAuth token");

    // Call backend promotion endpoint without authentication
    let client = CoordinatorClient::new();
    let request_body = serde_json::json!({
        "supabase_access_token": supabase_access_token
    });

    // Use the full URL constant instead of accessing private field
    let url = format!("{}/api/v1/auth/promote", crate::api::client::COORDINATOR_BASE_URL);

    let response = client.client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .context("Failed to send OAuth promotion request")?;

    let status = response.status();
    log::info!("OAuth promotion response status: {}", status);

    if status.is_success() {
        let promotion_response: PromotionResponse = response
            .json()
            .await
            .context("Failed to parse OAuth promotion response")?;

        log::info!("OAuth promotion successful");

        // Debug the JWT token
        let token = &promotion_response.token;
        if !token.is_empty() {
            log::info!("Raw OAuth JWT token received: {}", token);
            
            // Manually decode to see structure
            use base64::{Engine as _, engine::general_purpose};
            if let Some(payload_part) = token.split('.').nth(1) {
                let mut payload = payload_part.to_string();
                while payload.len() % 4 != 0 {
                    payload.push('=');
                }
                
                if let Ok(decoded) = general_purpose::STANDARD.decode(payload) {
                    if let Ok(jwt_payload) = String::from_utf8(decoded) {
                        log::info!("OAuth JWT payload: {}", jwt_payload);
                    }
                }
            }
            
            // Try parsing with current struct
            match crate::auth::parse_jwt_claims(token) {
                Ok(claims) => {
                    log::info!("OAuth JWT parsed successfully: {:?}", claims);
                }
                Err(e) => {
                    log::error!("OAuth JWT parsing failed: {}", e);
                }
            }
        } else {
            log::warn!("Received empty token from promotion response");
        }

        // Store the authenticated session locally
        if let Some(ref user_info) = promotion_response.user_info {
            let user_session = UserSessionResult {
                token: promotion_response.token.clone(),
                user_id: user_info.user_id.to_string(),
                expires_in: 86400, // 24 hours
                display_name: user_info.display_name.clone(),
                account_type: "authenticated".to_string(),
            };

            // Store session as authenticated account
            store_user_session(&user_session, AccountType::Authenticated).await
                .context("Failed to store authenticated session")?;
            
            log::info!("Authenticated session stored locally");
        }

        log::info!("OAuth authenticated session created successfully");
        Ok(promotion_response)
    } else {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        log::error!("OAuth promotion failed with status {}: {}", status, error_text);
        anyhow::bail!("OAuth promotion failed ({}): {}", status, error_text);
    }
}

pub async fn get_authenticated_client() -> Result<crate::api::CoordinatorClient> {
    let session = get_user_session().await?
        .ok_or_else(|| anyhow::anyhow!("No active user session"))?;
    
    let client = crate::api::CoordinatorClient::new();
    
    // Store the token in the client for authenticated requests
    {
        let mut token_guard = client.token.write().await;
        *token_guard = session.token;
    }
    
    Ok(client)
}