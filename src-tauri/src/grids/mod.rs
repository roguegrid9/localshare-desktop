// src-tauri/src/grids/mod.rs - Grid management service

use crate::api::{CoordinatorClient, types::{
    Grid, GridsState, GridMember, GridInvitation,
    CreateGridRequest, CreateGridResponse, GetMyGridsResponse,
    InviteToGridRequest, JoinGridRequest, GridDetailsResponse,
    SearchUsersResponse,
}};
use crate::api::types::{GridPermissions, ProcessPermissions, UpdateGridSettingsRequest, UpdateMemberPermissionsRequest, GetAuditLogRequest, GetAuditLogResponse};
use crate::auth::get_stored_token;
use crate::websocket::WebSocketManager;
use anyhow::{Result, Context};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;

pub struct GridsService {
    client: CoordinatorClient,
    websocket_manager: Arc<Mutex<WebSocketManager>>,
    grids_state: Arc<Mutex<GridsState>>,
}

impl GridsService {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            client: CoordinatorClient::new(),
            websocket_manager: Arc::new(Mutex::new(WebSocketManager::new(app_handle))),
            grids_state: Arc::new(Mutex::new(GridsState {
                grids: Vec::new(),
                grid_members: std::collections::HashMap::new(),
                pending_invitations: Vec::new(),
                last_updated: None,
                websocket_connected: false,
            })),
        }
    }

    pub async fn get_websocket_manager(&self) -> Arc<Mutex<WebSocketManager>> {
        self.websocket_manager.clone()
    }

    pub async fn connect_websocket(&self) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available for WebSocket connection")?;
        
        let websocket_url = self.client.get_websocket_url(&token);
        
        let mut manager = self.websocket_manager.lock().await;
        manager.connect(websocket_url).await?;
        
        // CRITICAL FIX: Get the WebSocket sender and pass it to P2P manager if available
        if let Some(sender) = manager.get_sender().await {
            // We need to get the P2P manager from somewhere - this will need to be passed in
            log::info!("WebSocket sender available for P2P manager");
            // This part will be handled in lib.rs
        }
        
        // Update state
        let mut state = self.grids_state.lock().await;
        state.websocket_connected = true;
        
        log::info!("WebSocket connected successfully");
        Ok(())
    }

    pub async fn disconnect_websocket(&self) -> Result<()> {
        let mut manager = self.websocket_manager.lock().await;
        manager.disconnect().await?;
        
        // Update state
        let mut state = self.grids_state.lock().await;
        state.websocket_connected = false;
        
        log::info!("WebSocket disconnected");
        Ok(())
    }

    pub async fn is_websocket_connected(&self) -> bool {
        let manager = self.websocket_manager.lock().await;
        manager.is_connected().await
    }

    // Create a new grid
    pub async fn create_grid(&self, request: CreateGridRequest) -> Result<CreateGridResponse> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let response = self.client.create_grid(&token, request).await?;
        
        // Refresh grids list after creating
        if let Err(e) = self.fetch_grids().await {
            log::warn!("Failed to refresh grids list after creating grid: {}", e);
        }
        
        log::info!("Created grid: {}", response.grid.name);
        Ok(response)
    }

    // Get user's grids
    pub async fn fetch_grids(&self) -> Result<GetMyGridsResponse> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let response = self.client.get_my_grids(&token).await?;
        
        // Update local state
        let mut state = self.grids_state.lock().await;
        state.grids = response.grids.clone();
        state.last_updated = Some(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs());
        
        log::info!("Fetched {} grids", response.grids.len());
        Ok(response)
    }

    // Get grids from cache
    pub async fn get_grids_from_cache(&self) -> GetMyGridsResponse {
        let state = self.grids_state.lock().await;
        GetMyGridsResponse {
            grids: state.grids.clone(),
            total: state.grids.len() as u32,
        }
    }

    // Get grid details and members
    pub async fn get_grid_details(&self, grid_id: String) -> Result<GridDetailsResponse> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let response = self.client.get_grid_details(&token, grid_id.clone()).await?;
        
        // Update local cache
        let mut state = self.grids_state.lock().await;
        state.grid_members.insert(grid_id, response.members.clone());
        
        log::info!("Fetched details for grid: {} ({} members)", response.grid.name, response.members.len());
        Ok(response)
    }

    // Get members for a specific grid
    pub async fn get_grid_members(&self, grid_id: String) -> Result<Vec<GridMember>> {
        // Try cache first
        {
            let state = self.grids_state.lock().await;
            if let Some(members) = state.grid_members.get(&grid_id) {
                return Ok(members.clone());
            }
        }

        // Fetch from server
        let details = self.get_grid_details(grid_id).await?;
        Ok(details.members)
    }

    // Invite user to grid
    pub async fn invite_user_to_grid(&self, grid_id: String, user_id: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let request = InviteToGridRequest {
            user_id: Some(user_id.clone()),
            username: None,
        };

        self.client.invite_to_grid(&token, grid_id.clone(), request).await?;
        
        // Refresh grid members after inviting
        if let Err(e) = self.get_grid_details(grid_id.clone()).await {
            log::warn!("Failed to refresh grid members after inviting user: {}", e);
        }
        
        log::info!("Invited user {} to grid {}", user_id, grid_id);
        Ok(())
    }

    // Join grid by invite code
    pub async fn join_grid_by_code(&self, invite_code: String) -> Result<Grid> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let request = JoinGridRequest {
            invite_code: Some(invite_code.clone()),
        };

        let grid = self.client.join_grid(&token, request).await?;
        
        // Refresh grids list after joining
        if let Err(e) = self.fetch_grids().await {
            log::warn!("Failed to refresh grids list after joining grid: {}", e);
        }
        
        log::info!("Joined grid: {}", grid.name);
        Ok(grid)
    }

    // Get pending grid invitations
    pub async fn get_grid_invitations(&self) -> Result<Vec<GridInvitation>> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let invitations = self.client.get_grid_invitations(&token).await?;
        
        // Update local state
        let mut state = self.grids_state.lock().await;
        state.pending_invitations = invitations.clone();
        
        log::info!("Fetched {} grid invitations", invitations.len());
        Ok(invitations)
    }

    // Accept grid invitation
    pub async fn accept_grid_invitation(&self, grid_id: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.accept_grid_invitation(&token, grid_id.clone()).await?;
        
        // Remove from pending invitations and refresh grids
        let mut state = self.grids_state.lock().await;
        state.pending_invitations.retain(|inv| inv.grid_id != grid_id);
        drop(state);
        
        if let Err(e) = self.fetch_grids().await {
            log::warn!("Failed to refresh grids after accepting invitation: {}", e);
        }
        
        log::info!("Accepted grid invitation for grid: {}", grid_id);
        Ok(())
    }

    // Decline grid invitation
    pub async fn decline_grid_invitation(&self, grid_id: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.decline_grid_invitation(&token, grid_id.clone()).await?;
        
        // Remove from pending invitations
        let mut state = self.grids_state.lock().await;
        state.pending_invitations.retain(|inv| inv.grid_id != grid_id);
        
        log::info!("Declined grid invitation for grid: {}", grid_id);
        Ok(())
    }

    // Search users (for inviting to grids)
    pub async fn search_users(&self, query: String, limit: Option<u32>) -> Result<SearchUsersResponse> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.search_users(&token, query, limit).await
    }

    pub async fn get_grids_state(&self) -> GridsState {
        let state = self.grids_state.lock().await;
        state.clone()
    }

    // Update grid member's online status (called from WebSocket events)
    pub async fn update_member_status(&self, grid_id: String, user_id: String, is_online: bool) {
        let mut state = self.grids_state.lock().await;
        
        if let Some(members) = state.grid_members.get_mut(&grid_id) {
            for member in members {
                if member.user_id == user_id {
                    member.is_online = is_online;
                    log::info!("Updated member {} status in grid {} to {}", user_id, grid_id, is_online);
                    break;
                }
            }
        }
    }

    // Handle incoming grid invitation notification
    pub async fn handle_grid_invitation_received(&self, payload: crate::api::types::GridInvitePayload) {
        log::info!("Received grid invitation for grid: {}", payload.grid_id);
        
        // Refresh grid invitations to get the latest state
        if let Err(e) = self.get_grid_invitations().await {
            log::warn!("Failed to refresh grid invitations after receiving new invitation: {}", e);
        }
    }

    // Handle grid member joined notification
    pub async fn handle_grid_member_joined(&self, payload: crate::api::types::GridJoinedPayload) {
        log::info!("Member {} joined grid: {}", payload.user_id, payload.grid_id);
        
        // Refresh grid members
        if let Err(e) = self.get_grid_details(payload.grid_id).await {
            log::warn!("Failed to refresh grid members after member joined: {}", e);
        }
    }

    // Send grid invitation via WebSocket
    pub async fn send_grid_invitation_ws(&self, grid_id: String, to_user_id: String) -> Result<()> {
        let manager = self.websocket_manager.lock().await;
        
        let message = serde_json::json!({
            "type": "grid_invite",
            "payload": {
                "grid_id": grid_id,
                "to_user_id": to_user_id
            }
        });
        
        manager.send_message(message).await?; 
        log::info!("Sent grid invitation via WebSocket for grid {} to user: {}", grid_id, to_user_id);
        Ok(())
    }

    // Check if two users share any grids (for P2P verification)
    pub async fn users_share_grid(&self, user_id_1: String, user_id_2: String) -> Option<String> {
        let state = self.grids_state.lock().await;
        
        for grid in &state.grids {
            if let Some(members) = state.grid_members.get(&grid.id) {
                let has_user_1 = members.iter().any(|m| m.user_id == user_id_1);
                let has_user_2 = members.iter().any(|m| m.user_id == user_id_2);
                
                if has_user_1 && has_user_2 {
                    return Some(grid.id.clone());
                }
            }
        }
        
        None
    }

    // Get all users who share grids with this user (for presence updates)
    pub async fn get_grid_peers(&self, user_id: String) -> Vec<String> {
        let state = self.grids_state.lock().await;
        let mut peers = std::collections::HashSet::new();
        
        for members in state.grid_members.values() {
            let user_in_grid = members.iter().any(|m| m.user_id == user_id);
            if user_in_grid {
                for member in members {
                    if member.user_id != user_id {
                        peers.insert(member.user_id.clone());
                    }
                }
            }
        }
        
        peers.into_iter().collect()
    }
    pub async fn get_grid_permissions(&self, grid_id: String) -> Result<GridPermissions> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let permissions = self.client.get_grid_permissions(&token, grid_id).await?;
        log::info!("Retrieved grid permissions");
        Ok(permissions)
    }

    // Update grid settings (admin/owner only)
    pub async fn update_grid_settings(&self, grid_id: String, settings: UpdateGridSettingsRequest) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.update_grid_settings(&token, grid_id, settings).await?;
        log::info!("Updated grid settings");
        Ok(())
    }

    // Update member permissions (admin/owner only)
    pub async fn update_member_permissions(&self, grid_id: String, member_id: String, permissions: UpdateMemberPermissionsRequest) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

       self.client.update_member_permissions(&token, grid_id, member_id.clone(), permissions).await?;
        log::info!("Updated member permissions for user: {}", member_id);
        Ok(())
    }

    // Get process permissions
    pub async fn get_process_permissions(&self, process_id: String) -> Result<ProcessPermissions> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let permissions = self.client.get_process_permissions(&token, process_id.clone()).await?;
        log::info!("Retrieved process permissions for: {}", process_id);
        Ok(permissions)
    }

    // Get grid audit log (admin/owner only)
    pub async fn get_grid_audit_log(&self, grid_id: String, request: GetAuditLogRequest) -> Result<GetAuditLogResponse> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        let audit_log = self.client.get_grid_audit_log(&token, grid_id.clone(), request).await?;
        log::info!("Retrieved audit log for grid: {} with {} entries", grid_id, audit_log.entries.len());
        Ok(audit_log)
    }

    // Helper method to check if current user has specific permission in a grid
    pub async fn has_grid_permission(&self, grid_id: String, permission: &str) -> bool {
        match self.get_grid_permissions(grid_id).await {
            Ok(permissions) => {
                match permission {
                    "invite" => permissions.can_invite,
                    "kick" => permissions.can_kick,
                    "ban" => permissions.can_ban,
                    "manage_roles" => permissions.can_manage_roles,
                    "create_process" => permissions.can_create_process,
                    "view_all_processes" => permissions.can_view_all_processes,
                    "connect_to_processes" => permissions.can_connect_to_processes,
                    "manage_own_processes" => permissions.can_manage_own_processes,
                    "manage_all_processes" => permissions.can_manage_all_processes,
                    "view_logs" => permissions.can_view_logs,
                    "send_commands" => permissions.can_send_commands,
                    "modify_settings" => permissions.can_modify_settings,
                    "delete_grid" => permissions.can_delete_grid,
                    "view_invite_code" => permissions.can_view_invite_code,
                    "view_audit_log" => permissions.can_view_audit_log,
                    _ => false,
                }
            }
            Err(e) => {
                log::warn!("Failed to check permission '{}': {}", permission, e);
                false
            }
        }
    }

    // Helper method to check process permissions
    pub async fn has_process_permission(&self, process_id: String, permission: &str) -> bool {
        match self.get_process_permissions(process_id).await {
            Ok(permissions) => {
                match permission {
                    "view" => permissions.can_view,
                    "connect" => permissions.can_connect,
                    "view_logs" => permissions.can_view_logs,
                    "send_commands" => permissions.can_send_commands,
                    "restart" => permissions.can_restart,
                    "modify_settings" => permissions.can_modify_settings,
                    _ => false,
                }
            }
            Err(e) => {
                log::warn!("Failed to check process permission '{}': {}", permission, e);
                false
            }
        }
    }

    // Check if user can perform an action before attempting it
    pub async fn verify_permission_before_action(&self, grid_id: String, action: &str) -> Result<()> {
        let has_permission = self.has_grid_permission(grid_id, action).await;
        if !has_permission {
            return Err(anyhow::anyhow!("Insufficient permissions to perform action: {}", action));
        }
        Ok(())
    }

    pub async fn delete_grid_process(&self, grid_id: String, process_id: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.delete_grid_process(&token, grid_id, process_id.clone()).await?;
        log::info!("Successfully deleted process: {}", process_id);
        Ok(())
    }

    pub async fn delete_grid_channel(&self, grid_id: String, channel_id: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.delete_grid_channel(&token, grid_id, channel_id.clone()).await?;
        log::info!("Successfully deleted channel: {}", channel_id);
        Ok(())
    }

    pub async fn update_member_role(&self, grid_id: String, user_id: String, new_role: String) -> Result<()> {
        let token = get_stored_token()
            .await
            .context("No token available")?;

        self.client.update_member_role(&token, grid_id.clone(), user_id.clone(), new_role).await?;
        
        // Refresh grid members after role change
        if let Err(e) = self.get_grid_details(grid_id).await {
            log::warn!("Failed to refresh grid members after role change: {}", e);
        }
        
        log::info!("Successfully updated member role for: {}", user_id);
        Ok(())
    }
}