// Tunnel client - WebSocket connection to server

use super::{HttpRequestPayload, HttpResponsePayload, TunnelMessage};
use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::time::{interval, sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Tunnel client that maintains WebSocket connection to server
pub struct TunnelClient {
    server_url: String,
    auth_token: String,
    grid_share_id: String,
    process_id: String,
    local_port: u16,

    // Channel to send HTTP responses back to server
    response_tx: mpsc::UnboundedSender<TunnelMessage>,

    // Callback for incoming HTTP requests
    request_callback: Arc<dyn Fn(HttpRequestPayload) -> HttpResponsePayload + Send + Sync>,

    // Connection state
    is_connected: Arc<RwLock<bool>>,
    tunnel_id: Arc<RwLock<Option<String>>>,
}

impl TunnelClient {
    /// Create a new tunnel client
    pub fn new<F>(
        server_url: String,
        auth_token: String,
        grid_share_id: String,
        process_id: String,
        local_port: u16,
        request_callback: F,
    ) -> Self
    where
        F: Fn(HttpRequestPayload) -> HttpResponsePayload + Send + Sync + 'static,
    {
        let (response_tx, _) = mpsc::unbounded_channel();

        Self {
            server_url,
            auth_token,
            grid_share_id,
            process_id,
            local_port,
            response_tx,
            request_callback: Arc::new(request_callback),
            is_connected: Arc::new(RwLock::new(false)),
            tunnel_id: Arc::new(RwLock::new(None)),
        }
    }

    /// Start the tunnel client with automatic reconnection
    pub async fn start(self: Arc<Self>) -> Result<()> {
        info!("Starting tunnel client for process {} on port {}",
              self.process_id, self.local_port);

        let mut reconnect_delay = Duration::from_secs(1);
        let max_reconnect_delay = Duration::from_secs(60);

        loop {
            match self.connect_and_run().await {
                Ok(_) => {
                    info!("Tunnel connection closed normally");
                    // Reset delay on successful connection
                    reconnect_delay = Duration::from_secs(1);
                }
                Err(e) => {
                    error!("Tunnel connection error: {}", e);
                    *self.is_connected.write().await = false;
                }
            }

            // Attempt reconnection with exponential backoff
            info!("Reconnecting in {:?}...", reconnect_delay);
            sleep(reconnect_delay).await;

            reconnect_delay = (reconnect_delay * 2).min(max_reconnect_delay);
        }
    }

    /// Connect to server and run message loop
    async fn connect_and_run(&self) -> Result<()> {
        // Build WebSocket URL with auth token as query parameter
        let ws_url = format!(
            "{}/api/v1/tunnel/{}/{}?token={}",
            self.server_url.replace("https://", "wss://").replace("http://", "ws://"),
            self.grid_share_id,
            self.process_id,
            self.auth_token
        );

        info!("Connecting to tunnel server: {}", ws_url);

        let (ws_stream, _) = connect_async(&ws_url)
            .await
            .context("Failed to connect to tunnel server")?;

        info!("WebSocket connection established");

        let (mut write, mut read) = ws_stream.split();

        *self.is_connected.write().await = true;

        // Create channels for internal communication
        let (response_tx, mut response_rx) = mpsc::unbounded_channel::<TunnelMessage>();

        // Spawn heartbeat task
        let heartbeat_tx = response_tx.clone();
        tokio::spawn(async move {
            let mut heartbeat_interval = interval(Duration::from_secs(30));
            loop {
                heartbeat_interval.tick().await;
                if heartbeat_tx.send(TunnelMessage::Heartbeat).is_err() {
                    break;
                }
            }
        });

        // Spawn task to send responses
        tokio::spawn(async move {
            while let Some(message) = response_rx.recv().await {
                let json = serde_json::to_string(&message).unwrap();
                if let Err(e) = write.send(Message::Text(json)).await {
                    error!("Failed to send message: {}", e);
                    break;
                }
            }
        });

        // Main message loop
        while let Some(message_result) = read.next().await {
            match message_result {
                Ok(Message::Text(text)) => {
                    if let Err(e) = self.handle_message(&text, &response_tx).await {
                        error!("Error handling message: {}", e);
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("Server closed connection");
                    break;
                }
                Ok(Message::Ping(data)) => {
                    // Pong is handled automatically
                    info!("Received ping");
                }
                Ok(_) => {}
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
            }
        }

        *self.is_connected.write().await = false;

        Ok(())
    }

    /// Handle incoming message from server
    async fn handle_message(
        &self,
        text: &str,
        response_tx: &mpsc::UnboundedSender<TunnelMessage>,
    ) -> Result<()> {
        let message: TunnelMessage = serde_json::from_str(text)
            .context("Failed to parse tunnel message")?;

        match message {
            TunnelMessage::Connected {
                tunnel_id,
                grid_share_id,
                process_id,
            } => {
                info!("Tunnel connected: id={}, grid={}, process={}",
                      tunnel_id, grid_share_id, process_id);
                *self.tunnel_id.write().await = Some(tunnel_id);
            }

            TunnelMessage::HttpRequest { request_id, payload } => {
                info!("Received HTTP request: {} {}", payload.method, payload.path);

                // Forward request to local process
                let callback = Arc::clone(&self.request_callback);
                let response_tx = response_tx.clone();
                let request_id_clone = request_id.clone();

                tokio::spawn(async move {
                    let response = callback(payload);

                    // Send response back to server
                    let message = TunnelMessage::HttpResponse {
                        request_id: request_id_clone,
                        payload: response,
                    };

                    if let Err(e) = response_tx.send(message) {
                        error!("Failed to send HTTP response: {}", e);
                    }
                });
            }

            TunnelMessage::HeartbeatAck => {
                // Server acknowledged heartbeat
            }

            TunnelMessage::Error { message } => {
                error!("Server error: {}", message);
            }

            _ => {
                warn!("Unexpected message type");
            }
        }

        Ok(())
    }

    /// Check if tunnel is connected
    pub async fn is_connected(&self) -> bool {
        *self.is_connected.read().await
    }

    /// Get tunnel ID
    pub async fn tunnel_id(&self) -> Option<String> {
        self.tunnel_id.read().await.clone()
    }
}
