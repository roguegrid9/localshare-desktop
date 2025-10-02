// src-tauri/src/transport/http_tunnel.rs
use super::TransportInfo;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::data_channel::RTCDataChannel;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use bytes::Bytes;

pub struct HttpTunnel {
    target_port: u16,
    service_name: String,
    grid_id: String,
    process_id: String,
    local_port: Option<u16>,
    listener: Arc<Mutex<Option<TcpListener>>>,
    data_channel: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
    is_running: Arc<Mutex<bool>>,
}

impl HttpTunnel {
    pub fn new(target_port: u16, service_name: String, grid_id: String, process_id: String) -> Self {
        Self {
            target_port,
            service_name,
            grid_id,
            process_id,
            local_port: None,
            listener: Arc::new(Mutex::new(None)),
            data_channel: Arc::new(Mutex::new(None)),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    async fn find_available_port() -> Result<u16> {
        // Try to find an available port starting from 3001
        for port in 3001..4000 {
            if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)).await {
                let local_port = listener.local_addr()?.port();
                drop(listener); // Close the test listener
                return Ok(local_port);
            }
        }
        Err(anyhow::anyhow!("No available ports found"))
    }

    async fn start_proxy_server(&mut self, local_port: u16, data_channel: Arc<RTCDataChannel>) -> Result<()> {
        let listener = TcpListener::bind(format!("127.0.0.1:{}", local_port)).await
            .with_context(|| format!("Failed to bind to port {}", local_port))?;

        log::info!("HTTP tunnel listening on http://localhost:{} -> remote port {}", 
                  local_port, self.target_port);

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
                                log::error!("Failed to accept connection: {}", e);
                                break;
                            }
                        }
                    } else {
                        break;
                    }
                };

                log::info!("HTTP tunnel: new connection from {}", addr);

                // Handle the connection
                let dc_clone = data_channel_ref.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::handle_http_connection(stream, dc_clone, target_port).await {
                        log::error!("HTTP connection error: {}", e);
                    }
                });
            }

            log::info!("HTTP tunnel proxy server stopped");
        });

        Ok(())
    }

    async fn handle_http_connection(
        mut local_stream: TcpStream, 
        data_channel: Arc<RTCDataChannel>,
        target_port: u16
    ) -> Result<()> {
        let mut buffer = vec![0u8; 8192];
        
        loop {
            // Read from local HTTP client
            match local_stream.read(&mut buffer).await {
                Ok(0) => break, // Connection closed
                Ok(n) => {
                    let request_data = &buffer[..n];
                    
                    // Log HTTP request for debugging
                    if let Some(request_str) = String::from_utf8_lossy(request_data).lines().next() {
                        log::debug!("HTTP Request: {}", request_str);
                    }

                    // Create HTTP-over-P2P message
                    let p2p_message = serde_json::json!({
                        "type": "http_request",
                        "target_port": target_port,
                        "data": base64::encode(request_data)
                    });

                    let message_bytes = p2p_message.to_string().into_bytes();

                    // Send over WebRTC data channel
                    if let Err(e) = data_channel.send(&Bytes::from(message_bytes)).await {
                        log::error!("Failed to send HTTP request over P2P: {}", e);
                        break;
                    }

                    // For now, send a simple response back
                    // In a full implementation, you'd wait for the response from the remote side
                    let response = format!(
                        "HTTP/1.1 200 OK\r\n\
                         Content-Type: text/html\r\n\
                         Content-Length: 85\r\n\
                         Connection: close\r\n\r\n\
                         <html><body><h1>P2P HTTP Tunnel</h1><p>Connected to remote port {}</p></body></html>",
                        target_port
                    );

                    if let Err(e) = local_stream.write_all(response.as_bytes()).await {
                        log::error!("Failed to write HTTP response: {}", e);
                        break;
                    }

                    break; // Close connection after response for now
                }
                Err(e) => {
                    log::error!("Failed to read from HTTP connection: {}", e);
                    break;
                }
            }
        }

        Ok(())
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
