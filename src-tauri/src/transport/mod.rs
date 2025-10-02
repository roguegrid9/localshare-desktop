// src/transport/mod.rs
pub mod http_tunnel;
pub mod tcp_tunnel;
pub mod terminal_tunnel;

use anyhow::Result;
use std::sync::Arc;
use webrtc::data_channel::RTCDataChannel;
use crate::grids::GridsService;
use serde_json::Value;
use tauri::State;
use crate::AppState;

#[derive(Debug, Clone, serde::Deserialize)]
pub enum TransportType {
    Http { target_port: u16, service_name: String },
    Tcp { target_port: u16, protocol: String },
    Terminal { shell_type: String },
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct TransportConfig {
    pub transport_type: TransportType,
    pub local_port: Option<u16>,
    pub grid_id: String,
    pub process_id: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TransportInfo {
    pub transport_type: String,
    pub local_port: u16,
    pub target_port: Option<u16>,
    pub connection_url: Option<String>,
    pub instructions: String,
}

// Use an enum instead of a trait object
pub enum TransportInstance {
    Http(http_tunnel::HttpTunnel),
    Tcp(tcp_tunnel::TcpTunnel),
    Terminal(terminal_tunnel::TerminalTunnel),
}

impl TransportInstance {
    pub async fn start(&mut self, data_channel: Arc<RTCDataChannel>) -> Result<u16> {
        match self {
            TransportInstance::Http(tunnel) => tunnel.start(data_channel).await,
            TransportInstance::Tcp(tunnel) => tunnel.start(data_channel).await,
            TransportInstance::Terminal(tunnel) => tunnel.start(data_channel).await,
        }
    }

    pub async fn stop(&mut self) -> Result<()> {
        match self {
            TransportInstance::Http(tunnel) => tunnel.stop().await,
            TransportInstance::Tcp(tunnel) => tunnel.stop().await,
            TransportInstance::Terminal(tunnel) => tunnel.stop().await,
        }
    }

    pub fn get_connection_info(&self) -> TransportInfo {
        match self {
            TransportInstance::Http(tunnel) => tunnel.get_connection_info(),
            TransportInstance::Tcp(tunnel) => tunnel.get_connection_info(),
            TransportInstance::Terminal(tunnel) => tunnel.get_connection_info(),
        }
    }
}

pub fn create_transport(config: TransportConfig) -> Result<TransportInstance> {
    match config.transport_type {
        TransportType::Http { target_port, service_name } => {
            Ok(TransportInstance::Http(http_tunnel::HttpTunnel::new(
                target_port,
                service_name,
                config.grid_id,
                config.process_id,
            )))
        }
        TransportType::Tcp { target_port, protocol } => {
            Ok(TransportInstance::Tcp(tcp_tunnel::TcpTunnel::new(
                target_port,
                protocol,
                config.grid_id,
                config.process_id,
            )))
        }
        TransportType::Terminal { shell_type } => {
            Ok(TransportInstance::Terminal(terminal_tunnel::TerminalTunnel::new(
                shell_type,
                config.grid_id,
                config.process_id,
            )))
        }
    }
}

pub struct TransportManager {
    // Add your fields here - for now just make it empty
}

impl TransportManager {
    pub fn new() -> Self {
        Self {}
    }
    
    pub async fn create_transport(&mut self, _grid_id: String, _process_id: Option<String>, _transport_type: TransportType, _config: TransportConfig) -> Result<String> {
        // TODO: Implement this
        Ok("transport_id".to_string())
    }
    
    pub fn get_transport_info(&self, _id: &str) -> Option<TransportInfo> {
        // TODO: Implement this
        None
    }

    /// Create transport specifically for container connections
    pub async fn create_container_transport(
        &mut self,
        grid_id: String,
        process_uuid: String,
        container_name: String,
        container_port: u16,
        transport_type: String,
    ) -> Result<String> {
        // Generate a unique transport ID
        let transport_id = format!("container_{}_{}", process_uuid, uuid::Uuid::new_v4().to_string()[..8].to_string());
        
        // Create transport config for container
        let transport_config = TransportConfig {
            transport_type: match transport_type.as_str() {
                "http_tunnel" => TransportType::Http {
                    target_port: container_port,
                    service_name: container_name.clone(),
                },
                "tcp_tunnel" => TransportType::Tcp {
                    target_port: container_port,
                    protocol: "tcp".to_string(),
                },
                _ => TransportType::Http {
                    target_port: container_port,
                    service_name: container_name.clone(),
                },
            },
            local_port: Some(0), // Auto-assign
            grid_id,
            process_id: process_uuid,
        };

        log::info!("Created container transport {} for {}:{}", transport_id, container_name, container_port);
        Ok(transport_id)
    }

    /// Get transport information for container connections
    pub fn get_container_transport_info(&self, transport_id: &str) -> Option<TransportInfo> {
        // This would normally look up the transport from storage
        // For now, return a placeholder
        Some(TransportInfo {
            transport_type: "http_tunnel".to_string(),
            local_port: 8080, // This should be the actual assigned port
            target_port: Some(80),
            connection_url: Some("http://localhost:8080".to_string()),
            instructions: "Container accessible via HTTP tunnel".to_string(),
        })
    }

    /// Stop a container transport connection
    pub async fn stop_container_transport(&mut self, transport_id: &str) -> Result<()> {
        log::info!("Stopping container transport: {}", transport_id);
        // TODO: Implement actual transport cleanup
        Ok(())
    }

    // Enhanced transport creation with permission checking
    pub async fn create_transport_with_permissions(
        &mut self,
        grid_id: String,
        process_id: Option<String>,
        transport_type: TransportType,
        config: TransportConfig,
        grids_service: &GridsService,
    ) -> Result<String> {
        // Check grid-level permissions first
        if !grids_service.has_grid_permission(grid_id.clone(), "connect_to_processes").await {
            return Err(anyhow::anyhow!("Insufficient permissions to connect to processes in this grid"));
        }

        // If connecting to a specific process, check process-level permissions
        if let Some(proc_id) = &process_id {
            if !grids_service.has_process_permission(proc_id.clone(), "connect").await {
                return Err(anyhow::anyhow!("Insufficient permissions to connect to this process"));
            }
        }

        // Check transport-specific permissions
        match transport_type {
            TransportType::Terminal { shell_type: _ } => {
                if !grids_service.has_grid_permission(grid_id.clone(), "send_commands").await {
                    log::warn!("User can connect to terminal but cannot send commands");
                }
            }
            TransportType::Http { target_port: _, service_name: _ } | TransportType::Tcp { target_port: _, protocol: _ } => {
                // Standard connection permissions are sufficient
            }
        }

        // Create the transport if permissions are valid
        self.create_transport(grid_id, process_id, transport_type, config).await
    }

    // Check if user can create transport for a specific process
    pub async fn can_create_transport(
        &self,
        grid_id: String,
        process_id: Option<String>,
        transport_type: TransportType,
        grids_service: &GridsService,
    ) -> bool {
        // Check basic grid permission
        if !grids_service.has_grid_permission(grid_id.clone(), "connect_to_processes").await {
            return false;
        }

        // Check process-specific permissions if applicable
        if let Some(proc_id) = process_id {
            if !grids_service.has_process_permission(proc_id, "connect").await {
                return false;
            }
        }

        // Check transport-type specific permissions
        match transport_type {
            TransportType::Terminal { shell_type: _ } => {
                // For terminals, user should be able to view at minimum
                grids_service.has_grid_permission(grid_id, "view_logs").await
            }
            TransportType::Http { target_port: _, service_name: _ } | TransportType::Tcp { target_port: _, protocol: _ } => {
                // Standard connection permissions are sufficient
                true
            }
        }
    }
}

// Add permission checking to existing transport commands
#[tauri::command]
pub async fn start_transport_tunnel_with_permissions(
    grid_id: String,
    process_id: Option<String>,
    transport_type: String,
    config: Value,
    state: State<'_, AppState>,
) -> Result<TransportInfo, String> {
    log::info!("Starting transport tunnel with permission checking for grid: {}", grid_id);

    // Get grids service for permission checking
    let grids_service_state = state.grids_service.lock().await;
    let grids_service = grids_service_state.as_ref()
        .ok_or("Grids service not initialized")?;

    // Check permissions before creating transport
    let transport_type_enum = match transport_type.as_str() {
        "http" => TransportType::Http { target_port: 0, service_name: "http".to_string() },
        "tcp" => TransportType::Tcp { target_port: 0, protocol: "tcp".to_string() },
        "terminal" => TransportType::Terminal { shell_type: "bash".to_string() },
        _ => return Err("Invalid transport type".to_string()),
    };

    let can_create = {
        let transport_manager = state.transport_manager.lock().await;
        if let Some(manager) = transport_manager.as_ref() {
            manager.can_create_transport(
                grid_id.clone(),
                process_id.clone(),
                transport_type_enum.clone(),
                grids_service,
            ).await
        } else {
            return Err("Transport manager not initialized".to_string());
        }
    };

    if !can_create {
        return Err("Insufficient permissions to create this transport".to_string());
    }

    // Create the transport if permissions are valid
    let mut transport_manager = state.transport_manager.lock().await;
    if let Some(manager) = transport_manager.as_mut() {
        let transport_config = serde_json::from_value(config)
            .map_err(|e| format!("Invalid transport config: {}", e))?;

        manager.create_transport_with_permissions(
            grid_id,
            process_id,
            transport_type_enum,
            transport_config,
            grids_service,
        ).await.map_err(|e| e.to_string())
            .and_then(|id| {
                // Get transport info to return
                match manager.get_transport_info(&id) {
                    Some(info) => Ok(info),
                    None => Err("Failed to get transport info".to_string()),
                }
            })
    } else {
        Err("Transport manager not initialized".to_string())
    }
}