use crate::api::client::CoordinatorClient;
use crate::api::types::{
    ResourceAccessCode, GenerateCodeRequest, GenerateCodeResponse,
    UseCodeRequest, UseCodeResponse, ListCodesRequest, ListCodesResponse,
    CodeUsageHistoryRequest, CodeUsageHistoryResponse, ProcessCodeOptions,
    GridInviteCodeOptions, ChannelCodeOptions, ResourceType,
    CodeGeneratedEvent, CodeUsedEvent, CodeRevokedEvent
};
use crate::auth::storage::get_user_session;
use crate::state::codes::{CodeState, CodeStats};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use tauri::Emitter;
use regex; 
pub struct ResourceCodesService {
    app_handle: AppHandle,
    client: CoordinatorClient,
    state: Arc<Mutex<CodeState>>,
}

impl ResourceCodesService {
    async fn get_token(&self) -> Result<String, anyhow::Error> {
        if let Some(session) = get_user_session().await? {
            Ok(session.token)
        } else {
            Err(anyhow::anyhow!("No active session found"))
        }
    }

    pub fn new(app_handle: AppHandle, state: Arc<Mutex<CodeState>>) -> Self {
        Self {
            app_handle,
            client: CoordinatorClient::new(),
            state,
        }
    }

    // ===== CORE OPERATIONS =====

    pub async fn generate_code(
        &self,
        grid_id: &str,
        request: GenerateCodeRequest,
    ) -> Result<GenerateCodeResponse> {
        let token = self.get_token().await?;
        
        log::info!("Generating code for resource type: {:?} in grid: {}", 
                   request.resource_type, grid_id);

        let response = self.client.generate_code(&token, grid_id, request).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.add_code(grid_id, response.code.clone());
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_generated_locally", &response) {
            log::error!("Failed to emit local code generation event: {}", e);
        }

        Ok(response)
    }

    pub async fn use_code(
        &self,
        grid_id: &str,
        request: UseCodeRequest,
    ) -> Result<UseCodeResponse> {
        let token = self.get_token().await?;
        
        log::info!("Using access code: {} in grid: {}", request.access_code, grid_id);

        let response = self.client.use_code(&token, grid_id, request).await?;

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_used_locally", &response) {
            log::error!("Failed to emit local code usage event: {}", e);
        }

        Ok(response)
    }

    pub async fn list_codes(
        &self,
        grid_id: &str,
        request: ListCodesRequest,
    ) -> Result<ListCodesResponse> {
        let token = self.get_token().await?;
        
        log::info!("Listing codes for grid: {}", grid_id);

        let response = self.client.list_codes(&token, grid_id, request).await?;

        // Update local state with fresh data
        {
            let mut state = self.state.lock().await;
            state.set_grid_codes(grid_id, response.codes.clone());
        }

        Ok(response)
    }

    pub async fn get_code_details(
        &self,
        grid_id: &str,
        code_id: &str,
    ) -> Result<ResourceAccessCode> {
        let token = self.get_token().await?;
        
        log::info!("Getting details for code: {} in grid: {}", code_id, grid_id);

        let code = self.client.get_code(&token, grid_id, code_id).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.update_code(grid_id, code.clone());
        }

        Ok(code)
    }

    pub async fn revoke_code(
        &self,
        grid_id: &str,
        code_id: &str,
    ) -> Result<()> {
        let token = self.get_token().await?;
        
        log::info!("Revoking code: {} in grid: {}", code_id, grid_id);

        self.client.revoke_code(&token, grid_id, code_id).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.remove_code(grid_id, code_id);
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_revoked_locally", serde_json::json!({
            "grid_id": grid_id,
            "code_id": code_id
        })) {
            log::error!("Failed to emit local code revocation event: {}", e);
        }

        Ok(())
    }

    pub async fn get_usage_history(
        &self,
        grid_id: &str,
        code_id: &str,
        request: CodeUsageHistoryRequest,
    ) -> Result<CodeUsageHistoryResponse> {
        let token = self.get_token().await?;
        
        log::info!("Getting usage history for code: {} in grid: {}", code_id, grid_id);

        let response = self.client.get_code_usage_history(&token, grid_id, code_id, request).await?;

        // Cache usage history
        {
            let mut state = self.state.lock().await;
            state.add_usage_history(code_id, response.entries.clone());
        }

        Ok(response)
    }

    // ===== CONVENIENCE METHODS =====

    pub async fn share_process(
        &self,
        grid_id: &str,
        process_id: &str,
        options: ProcessCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let token = self.get_token().await?;
        
        log::info!("Sharing process: {} in grid: {}", process_id, grid_id);

        let response = self.client.share_process(&token, grid_id, process_id, options).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.add_code(grid_id, response.code.clone());
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("process_shared", &response) {
            log::error!("Failed to emit process share event: {}", e);
        }

        Ok(response)
    }

    pub async fn create_invite_code(
        &self,
        grid_id: &str,
        options: GridInviteCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let token = self.get_token().await?;
        
        log::info!("Creating invite code for grid: {}", grid_id);

        let response = self.client.create_invite_code(&token, grid_id, options).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.add_code(grid_id, response.code.clone());
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("invite_code_created", &response) {
            log::error!("Failed to emit invite code creation event: {}", e);
        }

        Ok(response)
    }

    pub async fn share_channel(
        &self,
        grid_id: &str,
        channel_id: &str,
        channel_type: &str,
        options: ChannelCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let token = self.get_token().await?;
        
        log::info!("Sharing channel: {} type: {} in grid: {}", channel_id, channel_type, grid_id);

        let response = self.client.share_channel(&token, grid_id, channel_id, channel_type, options).await?;

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.add_code(grid_id, response.code.clone());
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("channel_shared", &response) {
            log::error!("Failed to emit channel share event: {}", e);
        }

        Ok(response)
    }

    // ===== STATE MANAGEMENT =====

    pub async fn get_grid_codes_from_cache(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        let state = self.state.lock().await;
        state.get_grid_codes(grid_id)
    }

    pub async fn get_active_codes_from_cache(&self, grid_id: &str) -> Vec<ResourceAccessCode> {
        let state = self.state.lock().await;
        state.get_active_codes(grid_id)
    }

    pub async fn get_my_codes_from_cache(&self) -> Vec<ResourceAccessCode> {
        let state = self.state.lock().await;
        state.get_my_codes()
    }

    pub async fn get_codes_by_resource(
        &self,
        grid_id: &str,
        resource_type: ResourceType,
        resource_id: &str,
    ) -> Vec<ResourceAccessCode> {
        let state = self.state.lock().await;
        state.get_codes_by_resource(grid_id, &resource_type, resource_id)
    }

    pub async fn get_code_stats(&self, grid_id: &str) -> CodeStats {
        let state = self.state.lock().await;
        state.get_codes_stats(grid_id)
    }

    pub async fn clear_grid_cache(&self, grid_id: &str) {
        let mut state = self.state.lock().await;
        state.clear_grid_data(grid_id);
    }

    // ===== REAL-TIME EVENT HANDLERS =====

    pub async fn handle_code_generated(&self, event: CodeGeneratedEvent) {
        log::info!("Handling code generated event for grid: {}", event.grid_id);

        // Update local state
        {
            let mut state = self.state.lock().await;
            state.add_code(&event.grid_id, event.code.clone());
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_generated", &event) {
            log::error!("Failed to emit code generated event: {}", e);
        }
    }

    pub async fn handle_code_used(&self, event: CodeUsedEvent) {
        log::info!("Handling code used event for grid: {}", event.grid_id);

        // Update usage count in local state
        {
            let mut state = self.state.lock().await;
            if let Some(codes) = state.grid_codes.get_mut(&event.grid_id) {
                if let Some(code) = codes.iter_mut().find(|c| c.id == event.code_id) {
                    if event.success {
                        code.used_count += 1;
                    }
                }
            }
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_used", &event) {
            log::error!("Failed to emit code used event: {}", e);
        }
    }

    pub async fn handle_code_revoked(&self, event: CodeRevokedEvent) {
        log::info!("Handling code revoked event for grid: {}", event.grid_id);

        // Remove from local state
        {
            let mut state = self.state.lock().await;
            state.remove_code(&event.grid_id, &event.code_id);
        }

        // Emit to frontend
        if let Err(e) = self.app_handle.emit("code_revoked", &event) {
            log::error!("Failed to emit code revoked event: {}", e);
        }
    }

    // ===== UTILITY METHODS =====

    pub fn create_shareable_link(&self, grid_id: &str, access_code: &str) -> String {
        format!("https://roguegrid9.com/join?grid={}&code={}", grid_id, access_code)
    }

    pub async fn copy_to_clipboard(&self, text: &str) -> Result<()> {
        // In a real implementation, you'd use the clipboard API
        // For now, we'll just log it and assume it works
        log::info!("Copying to clipboard: {}", text);
        Ok(())
    }

    // ===== VALIDATION HELPERS =====

    pub fn validate_access_code(code: &str) -> bool {
        // Support multiple formats for flexibility:
        // - XXX-XXX (6 chars, old format)
        // - XXX-XXXX (7 chars, new shorter format)
        // - XXXXXXX (7 chars, no separator)
        let cleaned = code.replace(|c: char| !c.is_alphanumeric(), "").to_uppercase();
        cleaned.len() >= 6 && cleaned.len() <= 8 && cleaned.chars().all(|c| c.is_alphanumeric())
    }

    pub fn format_access_code(code: &str) -> String {
        // Auto-format input to XXX-XXXX (3-4 format for better memorability)
        let cleaned = code.replace(|c: char| !c.is_alphanumeric(), "").to_uppercase();

        if cleaned.len() <= 3 {
            return cleaned;
        } else if cleaned.len() <= 7 {
            // Format as XXX-XXXX
            format!("{}-{}", &cleaned[..3], &cleaned[3..])
        } else {
            // Trim to 7 chars max and format
            format!("{}-{}", &cleaned[..3], &cleaned[3..7])
        }
    }

    
}
