// src-tauri/src/commands/transport.rs
use crate::transport::{TransportConfig, TransportType};
use crate::AppState;
use tauri::State;

#[derive(Debug, serde::Deserialize)]
pub struct StartTransportRequest {
    pub grid_id: String,
    pub process_id: String,
    pub transport_type: String, // "http", "tcp", "terminal"
    pub target_port: Option<u16>,
    pub service_name: Option<String>,
    pub protocol: Option<String>, // For TCP: "minecraft", "terraria", etc.
    pub shell_type: Option<String>, // For terminal: "bash", "zsh", etc.
}

#[derive(Debug, serde::Serialize)]
pub struct TransportStartedResponse {
    pub transport_id: String,
    pub local_port: u16,
    pub connection_url: Option<String>,
    pub instructions: String,
}

#[tauri::command]
pub async fn start_transport_tunnel(
    request: StartTransportRequest,
    state: State<'_, AppState>,
) -> Result<TransportStartedResponse, String> {
    log::info!("Tauri command: start_transport_tunnel called for grid: {}", request.grid_id);

    // Validate request
    let transport_type = match request.transport_type.as_str() {
        "http" => {
            let target_port = request.target_port
                .ok_or("target_port is required for HTTP transport")?;
            let service_name = request.service_name
                .unwrap_or_else(|| format!("HTTP Service (Port {})", target_port));
            
            TransportType::Http { target_port, service_name }
        }
        "tcp" => {
            let target_port = request.target_port
                .ok_or("target_port is required for TCP transport")?;
            let protocol = request.protocol
                .unwrap_or_else(|| "tcp".to_string());
            
            TransportType::Tcp { target_port, protocol }
        }
        "terminal" => {
            let shell_type = request.shell_type
                .unwrap_or_else(|| {
                    // Auto-detect shell based on OS
                    if cfg!(windows) {
                        "powershell".to_string()
                    } else {
                        "bash".to_string()
                    }
                });
            
            TransportType::Terminal { shell_type }
        }
        _ => return Err(format!("Unsupported transport type: {}", request.transport_type)),
    };

    // Create transport config
    let config = TransportConfig {
        transport_type,
        local_port: None, // Will be auto-assigned
        grid_id: request.grid_id.clone(),
        process_id: request.process_id.clone(),
    };

    // Get P2P manager and add transport to connection
    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        // Add debugging before attempting transport creation
        log::info!("Transport: Checking connection for grid: {}", request.grid_id);
        
        // Check if we're hosting this grid
        let grid_status_result = p2p_manager.get_grid_status(&request.grid_id).await;
        log::info!("Transport: Grid status check result: {:?}", grid_status_result);
        
        // Check active sessions
        let active_sessions = p2p_manager.get_active_sessions().await;
        log::info!("Transport: Found {} active sessions", active_sessions.len());
        for session in &active_sessions {
            log::info!("Transport: Session grid_id: {}", session.grid_id);
        }
        
        // Try to add transport to connection
        match p2p_manager.add_transport_to_connection(request.grid_id.clone(), config).await {
            Ok(transport_id) => {
                log::info!("Transport created successfully: {}", transport_id);
                
                // Return success - the actual transport info will come via events
                Ok(TransportStartedResponse {
                    transport_id: transport_id.clone(),
                    local_port: 0, // Will be updated via events
                    connection_url: None,
                    instructions: "Transport tunnel is starting...".to_string(),
                })
            }
            Err(e) => {
                log::error!("Transport creation failed: {}", e);
                
                // If it failed but we have a valid grid status, provide more helpful error
                if grid_status_result.is_ok() {
                    log::warn!("Grid status is OK but transport creation failed - possible timing issue");
                    Err(format!("Transport creation failed despite active hosting: {}. Try again in a moment.", e))
                } else {
                    log::error!("Grid not hosted and transport creation failed");
                    Err(format!("Grid not hosted. Please start hosting this grid first. Error: {}", e))
                }
            }
        }
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_transport_tunnel(
    transport_id: String,
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: stop_transport_tunnel called for: {}", transport_id);

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        p2p_manager.stop_grid_transport(grid_id, transport_id).await
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_active_transports(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("Tauri command: get_active_transports called for grid: {}", grid_id);

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        let transports = p2p_manager.get_grid_transports(grid_id).await;
        Ok(transports)
    } else {
        Err("P2P service not initialized".to_string())
    }
}

#[tauri::command]
pub async fn send_transport_terminal_input(
    grid_id: String,
    input: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Tauri command: send_terminal_input called for grid: {}", grid_id);

    let p2p_state = state.p2p_manager.lock().await;
    if let Some(p2p_manager) = p2p_state.as_ref() {
        // Create terminal input message
        let input_data = serde_json::json!({
            "data": base64::encode(input.as_bytes())
        });

        p2p_manager.send_transport_data(grid_id, "terminal_input".to_string(), input_data).await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("P2P service not initialized".to_string())
    }
}

// Helper function to detect service type from port and process
#[tauri::command]
pub async fn detect_service_type(
    port: u16,
    process_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<ServiceDetectionResult, String> {
    log::info!("Tauri command: detect_service_type called for port: {}", port);

    let service_type = detect_service_from_port(port, process_name.as_deref()).await;
    
    Ok(service_type)
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct ServiceDetectionResult {
    pub service_type: String, // "http", "minecraft", "terraria", "database", "unknown"
    pub transport_type: String, // "http", "tcp", "terminal"
    pub suggested_name: String,
    pub protocol: Option<String>,
    pub is_shareable: bool,
}

async fn detect_service_from_port(port: u16, process_name: Option<&str>) -> ServiceDetectionResult {
    // Well-known ports
    match port {
        // HTTP development servers
        3000 | 3001 | 3002 | 8000 | 8080 | 8081 | 8888 | 5000 | 5173 | 4200 | 3333 => {
            if let Ok(_response) = try_http_request(port).await {
                ServiceDetectionResult {
                    service_type: "http".to_string(),
                    transport_type: "http".to_string(),
                    suggested_name: format!("Web Server (Port {})", port),
                    protocol: Some("http".to_string()),
                    is_shareable: true,
                }
            } else {
                ServiceDetectionResult {
                    service_type: "tcp".to_string(),
                    transport_type: "tcp".to_string(),
                    suggested_name: format!("TCP Service (Port {})", port),
                    protocol: Some("tcp".to_string()),
                    is_shareable: true,
                }
            }
        }
        
        // Game servers
        25565 => ServiceDetectionResult {
            service_type: "minecraft".to_string(),
            transport_type: "tcp".to_string(),
            suggested_name: "Minecraft Server".to_string(),
            protocol: Some("minecraft".to_string()),
            is_shareable: true,
        },
        
        7777 | 7778 => ServiceDetectionResult {
            service_type: "terraria".to_string(),
            transport_type: "tcp".to_string(),
            suggested_name: "Terraria Server".to_string(),
            protocol: Some("terraria".to_string()),
            is_shareable: true,
        },
        
        // Databases (usually not shareable directly)
        5432 => ServiceDetectionResult {
            service_type: "postgresql".to_string(),
            transport_type: "tcp".to_string(),
            suggested_name: "PostgreSQL Database".to_string(),
            protocol: Some("postgresql".to_string()),
            is_shareable: false, // Databases usually need special handling
        },
        
        3306 => ServiceDetectionResult {
            service_type: "mysql".to_string(),
            transport_type: "tcp".to_string(),
            suggested_name: "MySQL Database".to_string(),
            protocol: Some("mysql".to_string()),
            is_shareable: false,
        },
        
        6379 => ServiceDetectionResult {
            service_type: "redis".to_string(),
            transport_type: "tcp".to_string(),
            suggested_name: "Redis Database".to_string(),
            protocol: Some("redis".to_string()),
            is_shareable: false,
        },
        
        // Default case - try to detect via process name or HTTP probe
        _ => {
            // Check process name hints
            if let Some(proc_name) = process_name {
                let lower_name = proc_name.to_lowercase();
                
                if lower_name.contains("node") || lower_name.contains("npm") || lower_name.contains("webpack") {
                    return ServiceDetectionResult {
                        service_type: "nodejs".to_string(),
                        transport_type: "http".to_string(),
                        suggested_name: format!("Node.js Server (Port {})", port),
                        protocol: Some("http".to_string()),
                        is_shareable: true,
                    };
                }
                
                if lower_name.contains("python") || lower_name.contains("django") || lower_name.contains("flask") {
                    return ServiceDetectionResult {
                        service_type: "python".to_string(),
                        transport_type: "http".to_string(),
                        suggested_name: format!("Python Server (Port {})", port),
                        protocol: Some("http".to_string()),
                        is_shareable: true,
                    };
                }
                
                if lower_name.contains("java") && lower_name.contains("server") {
                    return ServiceDetectionResult {
                        service_type: "minecraft".to_string(),
                        transport_type: "tcp".to_string(),
                        suggested_name: "Minecraft Server".to_string(),
                        protocol: Some("minecraft".to_string()),
                        is_shareable: true,
                    };
                }
            }
            
            // Try HTTP probe
            if let Ok(_) = try_http_request(port).await {
                ServiceDetectionResult {
                    service_type: "http".to_string(),
                    transport_type: "http".to_string(),
                    suggested_name: format!("HTTP Server (Port {})", port),
                    protocol: Some("http".to_string()),
                    is_shareable: true,
                }
            } else {
                ServiceDetectionResult {
                    service_type: "unknown".to_string(),
                    transport_type: "tcp".to_string(),
                    suggested_name: format!("Unknown Service (Port {})", port),
                    protocol: Some("tcp".to_string()),
                    is_shareable: true,
                }
            }
        }
    }
}

async fn try_http_request(port: u16) -> Result<String, Box<dyn std::error::Error>> {
    use tokio::time::timeout;
    use tokio::net::TcpStream;
    use tokio::io::{AsyncWriteExt, AsyncReadExt};
    
    // Try to connect and send a simple HTTP request
    let mut stream = timeout(
        std::time::Duration::from_millis(1000),
        TcpStream::connect(format!("localhost:{}", port))
    ).await??;
    
    // Send simple HTTP GET request
    let request = format!("GET / HTTP/1.1\r\nHost: localhost:{}\r\nConnection: close\r\n\r\n", port);
    stream.write_all(request.as_bytes()).await?;
    
    // Read response
    let mut buffer = vec![0; 1024];
    let n = timeout(
        std::time::Duration::from_millis(1000),
        stream.read(&mut buffer)
    ).await??;
    
    let response = String::from_utf8_lossy(&buffer[..n]);
    
    // Check if it looks like HTTP
    if response.starts_with("HTTP/") {
        Ok(response.to_string())
    } else {
        Err("Not HTTP".into())
    }
}