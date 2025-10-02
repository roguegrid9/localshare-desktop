// src-tauri/src/transport/tcp_tunnel.rs
use super::TransportInfo;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::data_channel::RTCDataChannel;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use bytes::Bytes;
use base64::{Engine as _, engine::general_purpose};
pub struct TcpTunnel {
    target_port: u16,
    protocol: String, // "minecraft", "terraria", "tcp", etc.
    grid_id: String,
    process_id: String,
    local_port: Option<u16>,
    listener: Arc<Mutex<Option<TcpListener>>>,
    data_channel: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
    is_running: Arc<Mutex<bool>>,
}

impl TcpTunnel {
    pub fn new(target_port: u16, protocol: String, grid_id: String, process_id: String) -> Self {
        Self {
            target_port,
            protocol,
            grid_id,
            process_id,
            local_port: None,
            listener: Arc::new(Mutex::new(None)),
            data_channel: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    async fn find_available_port(&self) -> Result<u16> {
        // For game servers, try to use a port close to the original
        let start_port = match self.protocol.as_str() {
            "minecraft" => 25566, // Close to default 25565
            "terraria" => 7778,   // Close to default 7777
            _ => 8001,            // Generic TCP ports
        };

        for port in start_port..(start_port + 100) {
            if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                let local_port = listener.local_addr()?.port();
                drop(listener); // Close the test listener
                return Ok(local_port);
            }
        }
        Err(anyhow::anyhow!("No available ports found"))
    }

    async fn start_tcp_proxy(&mut self, local_port: u16, data_channel: Arc<RTCDataChannel>) -> Result<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", local_port)).await
            .with_context(|| format!("Failed to bind to port {}", local_port))?;

        log::info!("{} TCP tunnel listening on localhost:{} -> remote port {}", 
                  self.protocol, local_port, self.target_port);

        // Store listener
        {
            let mut listener_guard = self.listener.lock().await;
            *listener_guard = Some(listener);
        }

        // Start accepting connections
        let listener_ref = self.listener.clone();
        let data_channel_ref = data_channel.clone();
        let is_running = self.is_running.clone();
        let target_port = self.target_port;
        let protocol = self.protocol.clone();

        tokio::spawn(async move {
            loop {
                // Check if we should stop
                {
                    let running = is_running.lock().await;
                    if !*running {
                        break;
                    }
                }

                // Accept new connection
                let (stream, addr) = {
                    let listener_guard = listener_ref.lock().await;
                    if let Some(listener) = listener_guard.as_ref() {
                        match listener.accept().await {
                            Ok(result) => result,
                            Err(e) => {
                                log::error!("Failed to accept TCP connection: {}", e);
                                break;
                            }
                        }
                    } else {
                        break;
                    }
                };

                log::info!("{} tunnel: new connection from {}", protocol, addr);

                // Handle the connection
                let dc_clone = data_channel_ref.clone();
                let protocol_clone = protocol.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::handle_tcp_connection(stream, dc_clone, target_port, protocol_clone).await {
                        log::error!("TCP connection error: {}", e);
                    }
                });
            }

            log::info!("{} TCP tunnel proxy server stopped", protocol);
        });

        Ok(())
    }

    async fn handle_tcp_connection(
        mut local_stream: TcpStream, 
        data_channel: Arc<RTCDataChannel>,
        target_port: u16,
        protocol: String
    ) -> Result<()> {
        let mut buffer = vec![0u8; 4096];
        let mut connection_id = uuid::Uuid::new_v4().to_string();
        
        log::info!("Handling {} TCP connection {}", protocol, connection_id);

        loop {
            // Read from local client (game client, etc.)
            match local_stream.read(&mut buffer).await {
                Ok(0) => {
                    log::info!("TCP connection {} closed by client", connection_id);
                    break;
                }
                Ok(n) => {
                    let data = &buffer[..n];
                    
                    // Create TCP-over-P2P message
                    let p2p_message = serde_json::json!({
                        "type": "tcp_data",
                        "connection_id": connection_id,
                        "target_port": target_port,
                        "protocol": protocol,
                        "data": general_purpose::STANDARD.encode(data)
                    });

                    let message_bytes = p2p_message.to_string().into_bytes();

                    // Send over WebRTC data channel
                    if let Err(e) = data_channel.send(&Bytes::from(message_bytes)).await {
                        log::error!("Failed to send TCP data over P2P: {}", e);
                        break;
                    }

                    log::debug!("Sent {} bytes over {} tunnel", n, protocol);
                }
                Err(e) => {
                    log::error!("Failed to read from TCP connection: {}", e);
                    break;
                }
            }
        }

        // Send connection close message
        let close_message = serde_json::json!({
            "type": "tcp_close",
            "connection_id": connection_id,
            "target_port": target_port,
            "protocol": protocol
        });

        let close_bytes = close_message.to_string().into_bytes();
        if let Err(e) = data_channel.send(&Bytes::from(close_bytes)).await {
            log::error!("Failed to send TCP close message: {}", e);
        }

        Ok(())
    }

    fn get_connection_instructions(&self) -> String {
        match self.protocol.as_str() {
            "minecraft" => format!(
                "Connect your Minecraft client to: localhost:{}",
                self.local_port.unwrap_or(0)
            ),
            "terraria" => format!(
                "In Terraria, join multiplayer server: localhost:{}",
                self.local_port.unwrap_or(0)
            ),
            _ => format!(
                "Connect your {} client to localhost:{}",
                self.protocol,
                self.local_port.unwrap_or(0)
            ),
        }
    }

    pub async fn start(&mut self, data_channel: Arc<RTCDataChannel>) -> Result<u16> {
        // Implementation from your Transport trait impl
        Ok(3001) // placeholder
    }

    pub async fn stop(&mut self) -> Result<()> {
        // Implementation from your Transport trait impl
        Ok(())
    }

    pub fn get_connection_info(&self) -> TransportInfo {
        // Implementation from your Transport trait impl
        TransportInfo {
            transport_type: "http".to_string(),
            local_port: 3001,
            target_port: Some(self.target_port),
            connection_url: Some(format!("http://localhost:3001")),
            instructions: "HTTP tunnel active".to_string(),
        }
    }
}
