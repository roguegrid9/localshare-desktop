use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FRPCredentials {
    pub server_addr: String,
    pub server_port: u16,
    pub auth_token: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub id: String,
    pub subdomain: String,
    pub local_port: u16,
    pub protocol: String, // "http", "https", "tcp"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FRPStatus {
    pub connected: bool,
    pub tunnels_active: usize,
    pub server_addr: Option<String>,
    pub uptime_seconds: u64,
}

pub const FRP_VERSION: &str = "0.52.0";
