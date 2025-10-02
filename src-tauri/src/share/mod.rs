// Share management for public process sharing
pub mod connection;

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use log::{info, error, warn};

pub use connection::ShareConnectionManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareInfo {
    pub share_id: String,
    pub process_id: String,
    pub port: u16,
    pub subdomain: String,
    pub custom_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareVisitor {
    pub visitor_id: String,
    pub share_id: String,
    pub connected_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareNotification {
    pub share_id: String,
    pub visitor_id: String,
    #[serde(rename = "type")]
    pub notification_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareSignalPayload {
    pub share_id: String,
    pub visitor_id: String,
    pub signal_type: String,
    pub signal_data: serde_json::Value,
}

pub struct ShareManager {
    active_shares: Arc<Mutex<HashMap<String, ShareInfo>>>,
    active_visitors: Arc<Mutex<HashMap<String, Vec<ShareVisitor>>>>,
}

impl ShareManager {
    pub fn new() -> Self {
        Self {
            active_shares: Arc::new(Mutex::new(HashMap::new())),
            active_visitors: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Register a new share
    pub async fn register_share(&self, share_info: ShareInfo) -> Result<()> {
        let mut shares = self.active_shares.lock().await;
        shares.insert(share_info.share_id.clone(), share_info.clone());
        info!("Registered share: {} for process {} on port {}",
              share_info.share_id, share_info.process_id, share_info.port);
        Ok(())
    }

    /// Unregister a share
    pub async fn unregister_share(&self, share_id: &str) -> Result<()> {
        let mut shares = self.active_shares.lock().await;
        shares.remove(share_id);

        // Also remove all visitors for this share
        let mut visitors = self.active_visitors.lock().await;
        visitors.remove(share_id);

        info!("Unregistered share: {}", share_id);
        Ok(())
    }

    /// Get share info by ID
    pub async fn get_share(&self, share_id: &str) -> Option<ShareInfo> {
        let shares = self.active_shares.lock().await;
        shares.get(share_id).cloned()
    }

    /// List all active shares
    pub async fn list_shares(&self) -> Vec<ShareInfo> {
        let shares = self.active_shares.lock().await;
        shares.values().cloned().collect()
    }

    /// Handle a visitor connection request
    pub async fn handle_visitor_request(&self, share_id: &str, visitor_id: &str) -> Result<ShareInfo> {
        let shares = self.active_shares.lock().await;
        let share = shares.get(share_id)
            .ok_or_else(|| anyhow::anyhow!("Share not found: {}", share_id))?;

        // Add visitor to active visitors
        let mut visitors = self.active_visitors.lock().await;
        let share_visitors = visitors.entry(share_id.to_string()).or_insert_with(Vec::new);

        let visitor = ShareVisitor {
            visitor_id: visitor_id.to_string(),
            share_id: share_id.to_string(),
            connected_at: chrono::Utc::now().timestamp(),
        };

        share_visitors.push(visitor.clone());

        info!("Visitor {} connected to share {}", visitor_id, share_id);

        Ok(share.clone())
    }

    /// Handle visitor disconnection
    pub async fn handle_visitor_disconnect(&self, share_id: &str, visitor_id: &str) -> Result<()> {
        let mut visitors = self.active_visitors.lock().await;

        if let Some(share_visitors) = visitors.get_mut(share_id) {
            share_visitors.retain(|v| v.visitor_id != visitor_id);
            info!("Visitor {} disconnected from share {}", visitor_id, share_id);
        }

        Ok(())
    }

    /// Get active visitors for a share
    pub async fn get_visitors(&self, share_id: &str) -> Vec<ShareVisitor> {
        let visitors = self.active_visitors.lock().await;
        visitors.get(share_id).cloned().unwrap_or_default()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ShareStatus {
    pub share_id: String,
    pub is_active: bool,
    pub visitor_count: usize,
    pub process_id: String,
    pub port: u16,
}

impl ShareManager {
    /// Get status for all shares
    pub async fn get_all_status(&self) -> Vec<ShareStatus> {
        let shares = self.active_shares.lock().await;
        let visitors = self.active_visitors.lock().await;

        shares.values().map(|share| {
            let visitor_count = visitors
                .get(&share.share_id)
                .map(|v| v.len())
                .unwrap_or(0);

            ShareStatus {
                share_id: share.share_id.clone(),
                is_active: true,
                visitor_count,
                process_id: share.process_id.clone(),
                port: share.port,
            }
        }).collect()
    }
}
