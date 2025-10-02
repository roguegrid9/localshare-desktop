// Tunnel client for grid sharing
// Establishes persistent WebSocket connection to server and proxies HTTP requests

pub mod client;
pub mod proxy;

pub use client::TunnelClient;
pub use proxy::HttpProxy;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::oneshot;

/// Message types for tunnel communication
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TunnelMessage {
    #[serde(rename = "connected")]
    Connected {
        tunnel_id: String,
        grid_share_id: String,
        process_id: String,
    },

    #[serde(rename = "http_request")]
    HttpRequest {
        request_id: String,
        #[serde(flatten)]
        payload: HttpRequestPayload,
    },

    #[serde(rename = "http_response")]
    HttpResponse {
        request_id: String,
        #[serde(flatten)]
        payload: HttpResponsePayload,
    },

    #[serde(rename = "heartbeat")]
    Heartbeat,

    #[serde(rename = "heartbeat_ack")]
    HeartbeatAck,

    #[serde(rename = "error")]
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequestPayload {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponsePayload {
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Vec<u8>>,
}

/// Pending request waiting for response from local process
pub struct PendingRequest {
    pub request_id: String,
    pub response_tx: oneshot::Sender<HttpResponsePayload>,
}
