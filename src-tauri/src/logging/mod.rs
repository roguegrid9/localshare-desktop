// src-tauri/src/logging/mod.rs
// Analytics and logging module for tracking events to Supabase

use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;
use std::env;

/// Represents an analytics event to be logged
#[derive(Debug, Serialize, Deserialize)]
pub struct Event {
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub event_data: JsonValue,
    pub app_version: String,
    pub platform: String,
}

/// Logger for sending events to Supabase
pub struct Logger {
    supabase_url: String,
    supabase_key: String,
}

impl Logger {
    /// Create a new Logger instance
    pub fn new() -> Result<Self, String> {
        let supabase_url = env::var("SUPABASE_URL")
            .map_err(|_| "SUPABASE_URL not set".to_string())?;
        let supabase_key = env::var("SUPABASE_ANON_KEY")
            .map_err(|_| "SUPABASE_ANON_KEY not set".to_string())?;

        Ok(Self {
            supabase_url,
            supabase_key,
        })
    }

    /// Log an event (fire-and-forget, won't block)
    pub fn log_event(&self, event: Event) {
        let url = format!("{}/rest/v1/events", self.supabase_url);
        let key = self.supabase_key.clone();

        // Spawn async task to send event (non-blocking)
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            let result = client
                .post(&url)
                .header("apikey", &key)
                .header("Authorization", format!("Bearer {}", &key))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal") // Don't return created row
                .json(&event)
                .send()
                .await;

            if let Err(e) = result {
                log::debug!("Failed to log event: {} (this is non-critical)", e);
            }
        });
    }

    // ============================================================================
    // Tier 1: CRITICAL Events
    // ============================================================================

    /// Log a connection attempt (P2P or relay)
    pub fn log_connection_attempt(
        &self,
        user_id: String,
        workspace_id: String,
        connection_type: &str,
        success: bool,
        duration_ms: u64,
        error_message: Option<String>,
    ) {
        let event = Event {
            event_type: "connection_attempt".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "connection_type": connection_type,
                "success": success,
                "attempt_duration_ms": duration_ms,
                "error_message": error_message,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log a successful connection establishment
    pub fn log_connection_established(
        &self,
        user_id: String,
        workspace_id: String,
        connection_type: &str,
        latency_ms: Option<u64>,
    ) {
        let event = Event {
            event_type: "connection_established".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "connection_type": connection_type,
                "latency_ms": latency_ms,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log a connection failure
    pub fn log_connection_failed(
        &self,
        user_id: String,
        workspace_id: String,
        attempted_type: &str,
        error: String,
        will_retry: bool,
    ) {
        let event = Event {
            event_type: "connection_failed".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "attempted_type": attempted_type,
                "error": error,
                "will_retry": will_retry,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log tunnel creation
    pub fn log_tunnel_created(
        &self,
        user_id: String,
        workspace_id: String,
        process_id: String,
        subdomain: String,
        local_port: u16,
        traffic_type: &str,
    ) {
        let event = Event {
            event_type: "tunnel_created".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "process_id": process_id,
                "subdomain": subdomain,
                "local_port": local_port,
                "traffic_type": traffic_type,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log tunnel error
    pub fn log_tunnel_error(
        &self,
        user_id: Option<String>,
        subdomain: String,
        error_type: &str,
        error_message: String,
    ) {
        let event = Event {
            event_type: "tunnel_error".to_string(),
            user_id,
            workspace_id: None,
            event_data: serde_json::json!({
                "subdomain": subdomain,
                "error_type": error_type,
                "error_message": error_message,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log process sharing
    pub fn log_process_shared(
        &self,
        user_id: String,
        workspace_id: String,
        process_type: String,
        port: u16,
        detection_method: &str,
    ) {
        let event = Event {
            event_type: "process_shared".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "process_type": process_type,
                "port": port,
                "detection_method": detection_method,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log when someone views/connects to a process
    pub fn log_process_viewed(
        &self,
        viewer_user_id: String,
        workspace_id: String,
        process_id: String,
        view_method: &str,
    ) {
        let event = Event {
            event_type: "process_viewed".to_string(),
            user_id: Some(viewer_user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "process_id": process_id,
                "view_method": view_method,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    // ============================================================================
    // Tier 2: IMPORTANT Events
    // ============================================================================

    /// Log session start
    pub fn log_session_start(
        &self,
        user_id: String,
        workspace_id: String,
    ) {
        let event = Event {
            event_type: "session_start".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({}),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log session end
    pub fn log_session_end(
        &self,
        user_id: String,
        workspace_id: String,
        duration_minutes: u64,
        bandwidth_used_mb: Option<f64>,
    ) {
        let event = Event {
            event_type: "session_end".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "duration_minutes": duration_minutes,
                "bandwidth_used_mb": bandwidth_used_mb,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log workspace creation
    pub fn log_workspace_created(
        &self,
        user_id: String,
        workspace_id: String,
    ) {
        let event = Event {
            event_type: "workspace_created".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({}),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log invite sent
    pub fn log_invite_sent(
        &self,
        user_id: String,
        workspace_id: String,
        invite_method: &str,
    ) {
        let event = Event {
            event_type: "invite_sent".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "invite_method": invite_method,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log user joined workspace
    pub fn log_user_joined(
        &self,
        user_id: String,
        workspace_id: String,
        join_method: &str,
    ) {
        let event = Event {
            event_type: "user_joined".to_string(),
            user_id: Some(user_id),
            workspace_id: Some(workspace_id),
            event_data: serde_json::json!({
                "join_method": join_method,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    /// Log feature usage
    pub fn log_feature_used(
        &self,
        user_id: String,
        workspace_id: Option<String>,
        feature_name: &str,
        metadata: Option<JsonValue>,
    ) {
        let event = Event {
            event_type: "feature_used".to_string(),
            user_id: Some(user_id),
            workspace_id,
            event_data: serde_json::json!({
                "feature_name": feature_name,
                "metadata": metadata,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }

    // ============================================================================
    // Generic Error Logging
    // ============================================================================

    /// Log a general error event
    pub fn log_error(
        &self,
        event_type: &str,
        error_message: String,
        context: JsonValue,
        user_id: Option<String>,
    ) {
        let event = Event {
            event_type: format!("{}_error", event_type),
            user_id,
            workspace_id: None,
            event_data: serde_json::json!({
                "error": error_message,
                "context": context,
            }),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: std::env::consts::OS.to_string(),
        };

        self.log_event(event);
    }
}
