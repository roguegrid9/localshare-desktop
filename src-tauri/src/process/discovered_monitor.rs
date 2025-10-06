use anyhow::Result;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::time;

/// Monitor for discovered processes (ProcessType::Discovered)
/// Periodically probes ports to detect if discovered processes are still alive
pub struct DiscoveredProcessMonitor {
    app_handle: AppHandle,
    monitoring_tasks: Arc<Mutex<Vec<tokio::task::JoinHandle<()>>>>,
}

impl DiscoveredProcessMonitor {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            monitoring_tasks: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Start monitoring a discovered process
    pub async fn start_monitoring(
        &self,
        process_id: String,
        grid_id: String,
        port: u16,
        protocol: String,
    ) -> Result<()> {
        log::info!(
            "Starting monitoring for discovered process {} on port {}",
            process_id,
            port
        );

        let app_handle = self.app_handle.clone();
        let process_id_clone = process_id.clone();
        let grid_id_clone = grid_id.clone();

        let task = tokio::spawn(async move {
            let mut consecutive_failures = 0;
            let max_failures = 3;

            loop {
                // Wait 10 seconds between probes
                time::sleep(Duration::from_secs(10)).await;

                // Probe the port
                let is_alive = if protocol == "tcp" || protocol == "http" {
                    probe_tcp_port(port).await
                } else if protocol == "udp" {
                    probe_udp_port(port).await
                } else {
                    // Unknown protocol, assume alive
                    true
                };

                if is_alive {
                    consecutive_failures = 0;
                    log::debug!("Process {} is still alive on port {}", process_id_clone, port);
                } else {
                    consecutive_failures += 1;
                    log::warn!(
                        "Process {} probe failed ({}/{})",
                        process_id_clone,
                        consecutive_failures,
                        max_failures
                    );

                    if consecutive_failures >= max_failures {
                        log::error!(
                            "Process {} has failed {} consecutive probes. Marking as stopped.",
                            process_id_clone,
                            max_failures
                        );

                        // Emit process stopped event
                        app_handle
                            .emit(
                                "discovered_process_stopped",
                                &serde_json::json!({
                                    "process_id": process_id_clone,
                                    "grid_id": grid_id_clone,
                                    "port": port,
                                    "reason": "consecutive_probe_failures"
                                }),
                            )
                            .ok();

                        // Stop monitoring
                        break;
                    }
                }
            }

            log::info!("Stopped monitoring process {}", process_id_clone);
        });

        // Store task handle
        let mut tasks = self.monitoring_tasks.lock().await;
        tasks.push(task);

        Ok(())
    }

    /// Stop monitoring a specific process
    pub async fn stop_monitoring(&self, process_id: &str) -> Result<()> {
        log::info!("Stopping monitoring for process {}", process_id);

        // For now, we'll just clear all tasks
        // In a production system, you'd track tasks by process_id
        let mut tasks = self.monitoring_tasks.lock().await;
        tasks.clear();

        Ok(())
    }

    /// Stop all monitoring tasks
    pub async fn stop_all(&self) -> Result<()> {
        log::info!("Stopping all discovered process monitoring");

        let mut tasks = self.monitoring_tasks.lock().await;
        for task in tasks.drain(..) {
            task.abort();
        }

        Ok(())
    }
}

/// Probe a TCP port to check if it's responsive
async fn probe_tcp_port(port: u16) -> bool {
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    // Try to connect with 2-second timeout
    let connect_future = TcpStream::connect(format!("127.0.0.1:{}", port));

    match timeout(Duration::from_secs(2), connect_future).await {
        Ok(Ok(_stream)) => {
            // Connection successful
            true
        }
        Ok(Err(_)) => {
            // Connection failed
            false
        }
        Err(_) => {
            // Timeout
            false
        }
    }
}

/// Probe a UDP port to check if it's responsive
/// Note: UDP is connectionless, so this is less reliable
async fn probe_udp_port(port: u16) -> bool {
    use tokio::net::UdpSocket;
    use tokio::time::timeout;

    match UdpSocket::bind("127.0.0.1:0").await {
        Ok(socket) => {
            // Try to send a packet
            let send_future = socket.send_to(b"ping", format!("127.0.0.1:{}", port));

            match timeout(Duration::from_secs(1), send_future).await {
                Ok(Ok(_)) => {
                    // Packet sent successfully
                    // For UDP, we assume it's alive if we can send
                    true
                }
                _ => false,
            }
        }
        Err(_) => false,
    }
}

/// Probe HTTP endpoint with a HEAD request
pub async fn probe_http_port(port: u16) -> bool {
    use reqwest::Client;
    use tokio::time::timeout;

    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| Client::new());

    let request_future = client
        .head(format!("http://127.0.0.1:{}", port))
        .send();

    match timeout(Duration::from_secs(2), request_future).await {
        Ok(Ok(_response)) => true,
        _ => false,
    }
}
