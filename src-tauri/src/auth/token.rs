use crate::api::{CoordinatorClient, UserSessionResult};
use crate::auth::{parse_jwt_claims, store_user_session, clear_user_session};
use anyhow::{Result, Context};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::auth::storage::AccountType;


pub async fn acquire_provisional_token(
    user_handle: String,
    display_name: String,
) -> Result<UserSessionResult> {
    log::info!("Starting token acquisition for user_handle: {}", user_handle);
    
    // Validate inputs
    if user_handle.trim().is_empty() {
        anyhow::bail!("User handle cannot be empty");
    }
    
    if display_name.trim().is_empty() {
        anyhow::bail!("Display name cannot be empty");
    }

    // Create coordinator client and acquire token
    let client = CoordinatorClient::new();
    
    let token_response = client
        .acquire_token(user_handle.clone(), display_name.clone())
        .await
        .context("Failed to acquire token from coordinator")?;

    // Parse JWT to extract developer handle and validate
    let jwt_claims = parse_jwt_claims(&token_response.token)
        .context("Failed to parse JWT token")?;

    log::info!("Token acquired successfully, parsing claims");
    log::info!("User ID: {}", token_response.user_id);
    log::info!("Developer handle: {}", jwt_claims.dev_handle.as_deref().unwrap_or("None"));
    log::info!("Token expires at: {}", jwt_claims.exp);

    // Store the session securely
    let session_result = UserSessionResult {
        token: token_response.token.clone(),
        account_type: "guest".to_string(),
        user_id: token_response.user_id.clone(),
        expires_in: token_response.expires_in,
        display_name: display_name.clone()
    };

    store_user_session(&session_result, AccountType::Guest)
        .await
        .context("Failed to store user session")?;

    log::info!("User session stored successfully");

    Ok(session_result)
}

pub async fn validate_current_token() -> Result<bool> {
    use crate::auth::get_user_session;
    
    match get_user_session().await? {
        Some(session) => {
            // Check if token is expired
            let current_time = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            
            // Parse JWT to get expiry
            match parse_jwt_claims(&session.token) {
                Ok(claims) => Ok(current_time < claims.exp),
                Err(_) => Ok(false),
            }
        },
        None => Ok(false),
    }
}

/// Promote a provisional account to a full account using Supabase
pub async fn promote_provisional_account(
    supabase_access_token: String,
) -> Result<crate::api::PromotionResponse> {
    use crate::auth::{SupabaseClient, get_user_session};
    use crate::api::CoordinatorClient;
    
    log::info!("Starting account promotion process");
    
    // Get current session
    let current_session = get_user_session().await?
        .ok_or_else(|| anyhow::anyhow!("No active session found"))?;
    
    log::info!("Current session found for user: {}", current_session.user_id);
    
    // Verify Supabase token and get user info
    let supabase_client = SupabaseClient::new();
    let supabase_user = supabase_client
        .verify_token(&supabase_access_token)
        .await
        .context("Failed to verify Supabase token")?;
    
    log::info!("Supabase token verified for user: {}", supabase_user.email);
    
    // CHANGE: Use email as display_name for authenticated users
    let display_name = supabase_user.email.clone(); // Full email, not extract_display_name
    let (provider, _provider_id) = supabase_client.extract_provider_info(&supabase_user);
    
    log::info!("Promoting account with provider: {} display_name: {}", provider, display_name);
    
    // Call coordinator to promote account
    let coordinator_client = CoordinatorClient::new();
    let promotion_response = coordinator_client
        .promote_account(&current_session.token, supabase_access_token)
        .await
        .context("Failed to promote account with coordinator")?;
    
    log::info!("Account promotion completed successfully");
    
    // TODO: Update local session to reflect full account status with email as display_name
    
    Ok(promotion_response)
}

pub async fn clear_current_session() -> Result<()> {
    log::info!("Clearing current user session");
    clear_user_session().await
        .context("Failed to clear user session")?;
    
    Ok(())
}

pub fn is_token_expired(expires_at: u64) -> bool {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    now >= expires_at
}
