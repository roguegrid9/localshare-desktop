// src-tauri/src/transport/tcp_tunnel.rs
use super::TransportInfo;
use anyhow::{Result, Context};
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::Mutex;
use webrtc::data_channel::RTCDataChannel;
use tokio::net::{TcpListener, TcpStream};
use tokio::net::tcp::OwnedWriteHalf;
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
    active_connections: Arc<Mutex<HashMap<String, Arc<Mutex<OwnedWriteHalf>>>>>,
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
            active_connections: Arc::new(Mutex::new(HashMap::new())),
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
        let active_connections = self.active_connections.clone();

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
                let connections_clone = active_connections.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::handle_tcp_connection(stream, dc_clone, target_port, protocol_clone, connections_clone).await {
                        log::error!("TCP connection error: {}", e);
                    }
                });
            }

            log::info!("{} TCP tunnel proxy server stopped", protocol);
        });

        Ok(())
    }

    async fn handle_tcp_connection(
        local_stream: TcpStream,
        data_channel: Arc<RTCDataChannel>,
        target_port: u16,
        protocol: String,
        active_connections: Arc<Mutex<HashMap<String, Arc<Mutex<OwnedWriteHalf>>>>>
    ) -> Result<()> {
        let connection_id = uuid::Uuid::new_v4().to_string();

        log::info!("Handling {} TCP connection {}", protocol, connection_id);

        // Split the stream into read and write halves
        let (mut read_half, write_half) = local_stream.into_split();

        // Store the write half for incoming data from P2P
        {
            let mut connections = active_connections.lock().await;
            connections.insert(connection_id.clone(), Arc::new(Mutex::new(write_half)));
        }

        let mut buffer = vec![0u8; 4096];
        let connection_id_clone = connection_id.clone();

        loop {
            // Read from local client (game client, etc.)
            match read_half.read(&mut buffer).await {
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

                    log::info!("📤 Sent {} bytes from local client to remote server over {} tunnel (connection {})", n, protocol, connection_id);
                }
                Err(e) => {
                    log::error!("Failed to read from TCP connection: {}", e);
                    break;
                }
            }
        }

        // Remove connection from active connections
        {
            let mut connections = active_connections.lock().await;
            connections.remove(&connection_id_clone);
        }

        // Send connection close message
        let close_message = serde_json::json!({
            "type": "tcp_close",
            "connection_id": connection_id_clone,
            "target_port": target_port,
            "protocol": protocol
        });

        let close_bytes = close_message.to_string().into_bytes();
        if let Err(e) = data_channel.send(&Bytes::from(close_bytes)).await {
            log::error!("Failed to send TCP close message: {}", e);
        }

        Ok(())
    }

    /// Write data to a specific TCP connection (for incoming P2P data)
    pub async fn write_to_connection(&self, connection_id: &str, data: &[u8]) -> Result<()> {
        let connections = self.active_connections.lock().await;

        if let Some(writer) = connections.get(connection_id) {
            let mut writer_guard = writer.lock().await;
            writer_guard.write_all(data).await?;
            log::info!("✅ Wrote {} bytes to TCP connection {}", data.len(), connection_id);
            Ok(())
        } else {
            log::error!("❌ TCP connection {} not found in active connections (have {} active)", connection_id, connections.len());
            Err(anyhow::anyhow!("TCP connection {} not found", connection_id))
        }
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
        // Find available port
        let local_port = self.find_available_port().await?;
        self.local_port = Some(local_port);

        // Store data channel
        {
            let mut dc_guard = self.data_channel.lock().await;
            *dc_guard = Some(data_channel.clone());
        }

        // Mark as running
        {
            let mut running = self.is_running.lock().await;
            *running = true;
        }

        // Start TCP proxy
        self.start_tcp_proxy(local_port, data_channel).await?;

        Ok(local_port)
    }

    pub async fn stop(&mut self) -> Result<()> {
        log::info!("Stopping {} TCP tunnel on port {:?}", self.protocol, self.local_port);

        // Mark as not running
        {
            let mut running = self.is_running.lock().await;
            *running = false;
        }

        // Clear listener
        {
            let mut listener_guard = self.listener.lock().await;
            *listener_guard = None;
        }

        // Clear data channel
        {
            let mut dc_guard = self.data_channel.lock().await;
            *dc_guard = None;
        }

        Ok(())
    }

    pub fn get_connection_info(&self) -> TransportInfo {
        let local_port = self.local_port.unwrap_or(0);
        TransportInfo {
            transport_type: "tcp".to_string(),
            local_port,
            target_port: Some(self.target_port),
            connection_url: Some(format!("localhost:{}", local_port)),
            instructions: self.get_connection_instructions(),
        }
    }
}
