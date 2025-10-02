// Share connection manager for handling public share WebRTC connections
use crate::transport::{create_transport, TransportConfig, TransportType, TransportInstance};
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::RTCIceCandidate;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use interceptor::registry::Registry;
use log::{info, error, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareVisitorConnection {
    pub share_id: String,
    pub visitor_id: String,
    pub process_id: String,
    pub port: u16,
    pub connected_at: i64,
}

pub struct ShareConnectionManager {
    active_connections: Arc<Mutex<HashMap<String, ShareConnection>>>, // Key: share_id:visitor_id
}

struct ShareConnection {
    share_id: String,
    visitor_id: String,
    peer_connection: Arc<RTCPeerConnection>,
    data_channel: Option<Arc<RTCDataChannel>>,
    transport: Option<TransportInstance>,
    local_port: Option<u16>,
}

impl ShareConnectionManager {
    pub fn new() -> Self {
        Self {
            active_connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Handle a visitor requesting access to a share
    pub async fn handle_visitor_request(
        &self,
        share_id: String,
        visitor_id: String,
        process_id: String,
        port: u16,
        grid_id: String,
    ) -> Result<RTCSessionDescription> {
        info!("Handling visitor {} request for share {} (process {} on port {})",
              visitor_id, share_id, process_id, port);

        // Create WebRTC peer connection
        let peer_connection = Self::create_peer_connection().await?;

        // Create data channel for communication (create_data_channel already returns Arc<RTCDataChannel>)
        let data_channel = peer_connection
            .create_data_channel("share_tunnel", None)
            .await?;

        // Set up data channel handlers
        let visitor_id_clone = visitor_id.clone();
        let dc_clone = data_channel.clone();
        dc_clone.on_open(Box::new(move || {
            let visitor_id = visitor_id_clone.clone();
            Box::pin(async move {
                info!("Data channel opened for visitor {}", visitor_id);
            })
        }));

        // Create HTTP tunnel for the process
        let mut transport = create_transport(TransportConfig {
            transport_type: TransportType::Http {
                target_port: port,
                service_name: format!("share_{}", share_id),
            },
            local_port: Some(0), // Auto-assign
            grid_id: grid_id.clone(),
            process_id: process_id.clone(),
        })?;

        // Start the tunnel
        let local_port = transport.start(data_channel.clone()).await?;
        info!("Started HTTP tunnel on localhost:{} for share {}", local_port, share_id);

        // Store connection
        let connection = ShareConnection {
            share_id: share_id.clone(),
            visitor_id: visitor_id.clone(),
            peer_connection: Arc::new(peer_connection),
            data_channel: Some(data_channel),
            transport: Some(transport),
            local_port: Some(local_port),
        };

        let connection_key = format!("{}:{}", share_id, visitor_id);
        let mut connections = self.active_connections.lock().await;
        connections.insert(connection_key, connection);

        // Get peer connection reference (it's moved into ShareConnection but we have Arc)
        let peer_conn = connections.get(&format!("{}:{}", share_id, visitor_id))
            .unwrap()
            .peer_connection
            .clone();

        // Create WebRTC offer
        let offer = peer_conn.create_offer(None).await?;
        peer_conn.set_local_description(offer.clone()).await?;

        info!("Created WebRTC offer for visitor {} on share {}", visitor_id, share_id);

        Ok(offer)
    }

    /// Handle WebRTC answer from visitor
    pub async fn handle_answer(
        &self,
        share_id: &str,
        visitor_id: &str,
        answer: RTCSessionDescription,
    ) -> Result<()> {
        info!("Handling answer from visitor {} for share {}", visitor_id, share_id);

        let connection_key = format!("{}:{}", share_id, visitor_id);
        let connections = self.active_connections.lock().await;

        if let Some(connection) = connections.get(&connection_key) {
            connection.peer_connection
                .set_remote_description(answer)
                .await?;
            info!("Set remote description for visitor {}", visitor_id);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Connection not found for visitor {}", visitor_id))
        }
    }

    /// Handle ICE candidate from visitor
    pub async fn handle_ice_candidate(
        &self,
        share_id: &str,
        visitor_id: &str,
        candidate_init: webrtc::ice_transport::ice_candidate::RTCIceCandidateInit,
    ) -> Result<()> {
        let connection_key = format!("{}:{}", share_id, visitor_id);
        let connections = self.active_connections.lock().await;

        if let Some(connection) = connections.get(&connection_key) {
            connection.peer_connection
                .add_ice_candidate(candidate_init)
                .await?;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Connection not found for visitor {}", visitor_id))
        }
    }

    /// Handle visitor disconnection
    pub async fn handle_disconnect(&self, share_id: &str, visitor_id: &str) -> Result<()> {
        info!("Handling disconnect for visitor {} from share {}", visitor_id, share_id);

        let connection_key = format!("{}:{}", share_id, visitor_id);
        let mut connections = self.active_connections.lock().await;

        if let Some(mut connection) = connections.remove(&connection_key) {
            // Close peer connection
            if let Err(e) = connection.peer_connection.close().await {
                error!("Failed to close peer connection: {}", e);
            }

            // Stop transport
            if let Some(mut transport) = connection.transport.take() {
                if let Err(e) = transport.stop().await {
                    error!("Failed to stop transport: {}", e);
                }
            }

            info!("Cleaned up connection for visitor {}", visitor_id);
        }

        Ok(())
    }

    /// Get active connection count for a share
    pub async fn get_visitor_count(&self, share_id: &str) -> usize {
        let connections = self.active_connections.lock().await;
        connections
            .keys()
            .filter(|k| k.starts_with(&format!("{}:", share_id)))
            .count()
    }

    /// Create a WebRTC peer connection with ICE servers
    async fn create_peer_connection() -> Result<RTCPeerConnection> {
        // Set up media engine
        let mut media_engine = MediaEngine::default();
        media_engine.register_default_codecs()?;

        // Set up interceptor registry
        let mut registry = Registry::new();
        registry = register_default_interceptors(registry, &mut media_engine)?;

        // Create API
        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        // Configure ICE servers (use public STUN by default)
        let config = RTCConfiguration {
            ice_servers: vec![
                RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        // Create peer connection
        let peer_connection = api.new_peer_connection(config).await?;

        // Set up connection state handler
        peer_connection.on_peer_connection_state_change(Box::new(move |state| {
            info!("Share connection state changed: {:?}", state);

            if state == RTCPeerConnectionState::Failed || state == RTCPeerConnectionState::Disconnected {
                warn!("Share connection failed or disconnected");
            }

            Box::pin(async {})
        }));

        // Set up ICE connection state handler
        peer_connection.on_ice_connection_state_change(Box::new(move |state| {
            info!("Share ICE connection state changed: {:?}", state);
            Box::pin(async {})
        }));

        Ok(peer_connection)
    }
}
