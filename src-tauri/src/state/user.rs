use crate::api::{UserState, CoordinatorClient, ConnectionStatus};
use crate::auth::{get_user_state, update_connection_status, is_token_expired};
use anyhow::Result;

pub async fn get_current_user_state() -> Result<UserState> {
    let mut state = get_user_state().await?;
    
    // Check if token is expired
    if let Some(expires_at) = state.token_expires_at {
        if is_token_expired(expires_at) {
            log::warn!("User token has expired");
            state.is_authenticated = false;
            state.is_provisional = false;
            state.connection_status = "disconnected".to_string();
        }
    }
    
    Ok(state)
}

pub async fn check_coordinator_connection() -> Result<ConnectionStatus> {
    log::info!("Checking coordinator connection");
    
    let client = CoordinatorClient::new();
    
    match client.health_check().await {
        Ok(true) => {
            update_connection_status("connected").await?;
            Ok(ConnectionStatus {
                status: "connected".to_string(),
                last_ping: Some(get_current_timestamp()),
                coordinator_url: "https://roguegrid9-coordinator.fly.dev".to_string(),
            })
        }
        Ok(false) => {
            update_connection_status("unhealthy").await?;
            Ok(ConnectionStatus {
                status: "unhealthy".to_string(),
                last_ping: Some(get_current_timestamp()),
                coordinator_url: "https://roguegrid9-coordinator.fly.dev".to_string(),
            })
        }
        Err(e) => {
            log::error!("Coordinator connection failed: {}", e);
            update_connection_status("disconnected").await?;
            Ok(ConnectionStatus {
                status: "disconnected".to_string(),
                last_ping: None,
                coordinator_url: "https://roguegrid9-coordinator.fly.dev".to_string(),
            })
        }
    }
}

fn get_current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}