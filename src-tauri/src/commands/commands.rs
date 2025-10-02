// src-tauri/src/commands/services.rs
use crate::services::{DetectedService, ServiceType, TunnelType, ServiceStatus, DetectionMethod};
use crate::transport::{TransportType, TransportConfig};
use crate::AppState;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct RegisterServiceRequest {
    pub port: u16,
    pub tunnel_type: String, // "http", "tcp", "udp"
    pub service_name: String,
    pub process_info: Option<String>,
    pub session_id: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct ServiceRegistrationResponse {
    pub service_id: String,
    pub sharing_code: Option<String>,
    pub connection_info: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ManualPortForwardRequest {
    pub port: u16,
    pub tunnel_type: String,
    pub description: Option<String>,
    pub grid_id: String,
}

/// Register a service programmatically (for presets)
#[tauri::command]
pub async fn register_service(
    request: RegisterServiceRequest,
    state: State<'_, AppState>,
) -> Result<ServiceRegistrationResponse, String> {
    log::info!("Registering service: {} on port {}", request.service_name, request.port);

    // Validate port is accessible
    if !is_port_accessible(request.port).await {
        return Err(format!("Port {} is not accessible", request.port));
    }

    // Parse tunnel type
    let tunnel_type = match request.tunnel_type.to_lowercase().as_str() {
        "http" | "https" => TunnelType::Http,
        "tcp" => TunnelType::Tcp,
        "terminal" => TunnelType::Terminal,
        _ => return Err(format!("Invalid tunnel type: {}", request.tunnel_type)),
    };

    // Determine service type from port and metadata
    let service_type = detect_service_type_from_request(&request);

    // Create detected service
    let service = DetectedService {
        service_id: Uuid::new_v4().to_string(),
        session_id: request.session_id,
        process_id: None, // Will be set if linked to a process
        port: request.port,
        service_type,
        tunnel_type: tunnel_type.clone(),
        name: request.service_name.clone(),
        status: ServiceStatus::Running,
        detection_method: DetectionMethod::PresetRegistration,
        detected_at: chrono::Utc::now(),
        metadata: request.metadata.unwrap_or_default(),
    };

    // Store in service registry
    {
        let mut registry_state = state.service_registry.lock().await;
        if let Some(registry) = registry_state.as_mut() {
            registry.register_service(service.clone()).await.map_err(|e| e.to_string())?;
        } else {
            return Err("Service registry not initialized".to_string());
        }
    }

    // Generate sharing code if requested
    let sharing_code = generate_service_sharing_code(&service, &state).await?;

    // Emit event for frontend
    {
        let app_state = state.inner();
        if let Some(app_handle) = &app_state.app_handle {
            if let Err(e) = app_handle.emit("service_registered", &service) {
                log::warn!("Failed to emit service registration event: {}", e);
            }
        }
    }

    log::info!("Service registered successfully: {}", service.service_id);

    Ok(ServiceRegistrationResponse {
        service_id: service.service_id,
        sharing_code,
        connection_info: Some(format!("localhost:{}", request.port)),
    })
}

/// Unregister a service
#[tauri::command]
pub async fn unregister_service(
    service_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Unregistering service: {}", service_id);

    // Remove from service registry
    {
        let mut registry_state = state.service_registry.lock().await;
        if let Some(registry) = registry_state.as_mut() {
            registry.unregister_service(&service_id).await.map_err(|e| e.to_string())?;
        } else {
            return Err("Service registry not initialized".to_string());
        }
    }

    // Clean up any associated tunnels
    {
        let mut transport_state = state.transport_manager.lock().await;
        if let Some(transport_manager) = transport_state.as_mut() {
            // Stop any tunnels associated with this service
            if let Err(e) = transport_manager.stop_service_tunnel(&service_id).await {
                log::warn!("Failed to stop tunnel for service {}: {}", service_id, e);
            }
        }
    }

    // Emit event for frontend
    {
        let app_state = state.inner();
        if let Some(app_handle) = &app_state.app_handle {
            if let Err(e) = app_handle.emit("service_unregistered", &serde_json::json!({
                "service_id": service_id
            })) {
                log::warn!("Failed to emit service unregistration event: {}", e);
            }
        }
    }

    log::info!("Service unregistered successfully: {}", service_id);
    Ok(())
}

/// Manual port forwarding (fallback for undetected services)
#[tauri::command]
pub async fn manual_port_forward(
    request: ManualPortForwardRequest,
    state: State<'_, AppState>,
) -> Result<ServiceRegistrationResponse, String> {
    log::info!("Manual port forward requested: port {} as {}", request.port, request.tunnel_type);

    // Validate port
    if !is_port_accessible(request.port).await {
        return Err(format!("Port {} is not accessible", request.port));
    }

    // Create service registration
    let service_request = RegisterServiceRequest {
        port: request.port,
        tunnel_type: request.tunnel_type,
        service_name: request.description.unwrap_or_else(|| format!("Manual forward: {}", request.port)),
        process_info: None,
        session_id: None,
        metadata: Some({
            let mut meta = HashMap::new();
            meta.insert("grid_id".to_string(), request.grid_id);
            meta.insert("manual_forward".to_string(), "true".to_string());
            meta
        }),
    };

    // Register the service
    register_service(service_request, state).await
}

/// Get all registered services
#[tauri::command]
pub async fn get_registered_services(
    state: State<'_, AppState>,
) -> Result<Vec<DetectedService>, String> {
    let registry_state = state.service_registry.lock().await;
    if let Some(registry) = registry_state.as_ref() {
        Ok(registry.get_all_services().await)
    } else {
        Err("Service registry not initialized".to_string())
    }
}

/// Get services for a specific grid
#[tauri::command]
pub async fn get_grid_services(
    grid_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<DetectedService>, String> {
    let registry_state = state.service_registry.lock().await;
    if let Some(registry) = registry_state.as_ref() {
        Ok(registry.get_services_for_grid(&grid_id).await)
    } else {
        Err("Service registry not initialized".to_string())
    }
}

/// Create sharing code for a service
#[tauri::command]
pub async fn create_service_sharing_code(
    service_id: String,
    expiry_minutes: Option<u32>,
    usage_limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Creating sharing code for service: {}", service_id);

    // Get service details
    let service = {
        let registry_state = state.service_registry.lock().await;
        if let Some(registry) = registry_state.as_ref() {
            registry.get_service(&service_id).await
                .ok_or_else(|| format!("Service not found: {}", service_id))?
        } else {
            return Err("Service registry not initialized".to_string());
        }
    };

    // Create transport config for the service
    let transport_type = match service.tunnel_type {
        TunnelType::Http => TransportType::Http {
            target_port: service.port,
            service_name: service.name.clone(),
        },
        TunnelType::Tcp => TransportType::Tcp {
            target_port: service.port,
            protocol: "tcp".to_string(),
        },
        TunnelType::Terminal => TransportType::Terminal {
            shell_type: "bash".to_string(),
        },
    };

    // Generate resource code
    let mut codes_state = state.resource_codes.lock().await;
    if let Some(codes_manager) = codes_state.as_mut() {
        let code = codes_manager.generate_code(
            "service".to_string(),
            service_id,
            serde_json::to_value(transport_type).map_err(|e| e.to_string())?,
            expiry_minutes.unwrap_or(60),
            usage_limit.unwrap_or(10),
        ).await.map_err(|e| e.to_string())?;

        log::info!("Sharing code generated for service: {}", code);
        Ok(code)
    } else {
        Err("Resource codes manager not initialized".to_string())
    }
}

/// Connect to a service via sharing code
#[tauri::command]
pub async fn connect_to_service_via_code(
    sharing_code: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    log::info!("Connecting to service via code: {}", sharing_code);

    // Validate and use the code
    let resource_data = {
        let mut codes_state = state.resource_codes.lock().await;
        if let Some(codes_manager) = codes_state.as_mut() {
            codes_manager.use_code(sharing_code).await.map_err(|e| e.to_string())?
        } else {
            return Err("Resource codes manager not initialized".to_string());
        }
    };

    // Parse transport config
    let transport_type: TransportType = serde_json::from_value(resource_data.data)
        .map_err(|e| format!("Invalid transport config: {}", e))?;

    // Create transport
    let mut transport_state = state.transport_manager.lock().await;
    if let Some(transport_manager) = transport_state.as_mut() {
        let transport_config = TransportConfig {
            transport_type,
            local_port: None,
            grid_id: resource_data.resource_id.clone(),
            process_id: resource_data.resource_id,
        };

        let connection_id = transport_manager.create_transport(
            "remote".to_string(), // Grid ID for remote connection
            None,
            transport_config.transport_type.clone(),
            transport_config,
        ).await.map_err(|e| e.to_string())?;

        log::info!("Connected to service, connection ID: {}", connection_id);
        Ok(connection_id)
    } else {
        Err("Transport manager not initialized".to_string())
    }
}

/// Stop monitoring a terminal session
#[tauri::command]
pub async fn stop_service_monitoring(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let detector_state = state.service_detector.lock().await;
    if let Some(detector) = detector_state.as_ref() {
        detector.stop_monitoring(&session_id);
        Ok(())
    } else {
        Err("Service detector not initialized".to_string())
    }
}

/// Get monitoring status
#[tauri::command]
pub async fn get_monitoring_status(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let detector_state = state.service_detector.lock().await;
    if let Some(detector) = detector_state.as_ref() {
        Ok(detector.get_monitoring_sessions())
    } else {
        Err("Service detector not initialized".to_string())
    }
}

// Helper functions

async fn is_port_accessible(port: u16) -> bool {
    use tokio::net::TcpStream;
    use std::time::Duration;
    
    let address = format!("127.0.0.1:{}", port);
    
    match tokio::time::timeout(
        Duration::from_millis(1000),
        TcpStream::connect(&address)
    ).await {
        Ok(Ok(_)) => true,  // Connection successful
        Ok(Err(_)) => false, // Connection failed
        Err(_) => false,     // Timeout
    }
}

fn detect_service_type_from_request(request: &RegisterServiceRequest) -> ServiceType {
    // Check metadata for hints
    if let Some(metadata) = &request.metadata {
        if let Some(service_type) = metadata.get("service_type") {
            match service_type.as_str() {
                "minecraft" => return ServiceType::MinecraftServer,
                "terraria" => return ServiceType::TerrariaServer,
                "http" => return ServiceType::HttpServer,
                _ => {}
            }
        }
    }

    // Check service name
    let name_lower = request.service_name.to_lowercase();
    if name_lower.contains("minecraft") {
        return ServiceType::MinecraftServer;
    }
    if name_lower.contains("terraria") {
        return ServiceType::TerrariaServer;
    }
    if name_lower.contains("http") || name_lower.contains("web") || name_lower.contains("server") {
        return ServiceType::HttpServer;
    }

    // Check port conventions
    match request.port {
        80 | 8000..=8999 | 3000..=3999 | 5000..=5999 => ServiceType::HttpServer,
        25565 => ServiceType::MinecraftServer,
        7777 | 7778 => ServiceType::TerrariaServer,
        3306 | 5432 => ServiceType::DatabaseServer,
        _ => {
            match request.tunnel_type.as_str() {
                "http" => ServiceType::HttpServer,
                "tcp" => ServiceType::CustomTcp,
                _ => ServiceType::Unknown,
            }
        }
    }
}

async fn generate_service_sharing_code(
    service: &DetectedService,
    state: &State<'_, AppState>,
) -> Result<Option<String>, String> {
    // Create transport config for the service
    let transport_type = match service.tunnel_type {
        TunnelType::Http => TransportType::Http {
            target_port: service.port,
            service_name: service.name.clone(),
        },
        TunnelType::Tcp => TransportType::Tcp {
            target_port: service.port,
            protocol: "tcp".to_string(),
        },
        TunnelType::Terminal => TransportType::Terminal {
            shell_type: "bash".to_string(),
        },
    };

    // Generate resource code
    let mut codes_state = state.resource_codes.lock().await;
    if let Some(codes_manager) = codes_state.as_mut() {
        let code = codes_manager.generate_code(
            "service".to_string(),
            service.service_id.clone(),
            serde_json::to_value(transport_type).map_err(|e| e.to_string())?,
            60, // 1 hour default
            10, // 10 uses default
        ).await.map_err(|e| e.to_string())?;

        Ok(Some(code))
    } else {
        Ok(None) // No codes manager available
    }
}
