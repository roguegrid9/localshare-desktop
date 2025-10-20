use crate::api::types::{
    TokenRequest, TokenResponse, PromotionRequest, PromotionResponse,
    SearchUsersRequest, SearchUsersResponse,
    CreateGridRequest, CreateGridResponse, GetMyGridsResponse,
    InviteToGridRequest, JoinGridRequest, GridDetailsResponse, Grid,
    GridInvitation, ResourceAccessCode, ResourceType, GenerateCodeRequest, GenerateCodeResponse,
    UseCodeRequest, UseCodeResponse, ListCodesRequest, ListCodesResponse,
    CodeUsageHistoryRequest, CodeUsageHistoryResponse, ProcessCodeOptions,
    GridInviteCodeOptions, ChannelCodeOptions, CurrentUserResponse,
    RegisterContainerRequest, ContainerProcessResponse, ListContainersResponse, UpdateContainerStatusRequest,
    TrackConnectionRequest, ContainerStatsResponse,
    CreateSharedProcessRequest, CreateSharedProcessResponse, GetGridSharedProcessesResponse,
    UpdateSharedProcessStatusRequest,
    GridRelayStatusResponse, UpdateRelayModeRequest, PurchaseBandwidthRequest,
    PaymentIntentResponse, ReportBandwidthUsageRequest,
    RelaySubscription, GetCredentialsResponse, Tunnel, SubdomainAvailability,
    StartTrialRequest, CreateTunnelRequest, ReportNATStatusRequest
};
use crate::api::types::{GridPermissions, ProcessPermissions, UpdateGridSettingsRequest, UpdateMemberPermissionsRequest, GetAuditLogRequest, GetAuditLogResponse};
use anyhow::{Result, Context};
use reqwest::Client;
use base64::prelude::*;
use std::time::Duration;
use anyhow::bail;
use crate::p2p::GridSessionStatus;
use crate::api::CheckUsernameAvailabilityResponse;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde;

// Configuration constants
pub const COORDINATOR_BASE_URL: &str = "https://api.roguegrid9.com";
pub const REQUEST_TIMEOUT_SECS: u64 = 30;

// Bootstrap credentials from Session 1
pub const BOOTSTRAP_API_KEY: &str = "k_rg9_prod_yAFbN0-EGLm0uSNrEhAfG8CrBFQCBHpz";
pub const BOOTSTRAP_API_SECRET: &str = "s_rg9_prod_4cZKXFNNsrLEaNnTWuDK9VF_AXY-YX3n";

pub struct CoordinatorClient {
    pub client: Client,
    base_url: String,
    api_key: String,
    api_secret: String,
    pub token: Arc<RwLock<String>>,
}

impl CoordinatorClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: COORDINATOR_BASE_URL.to_string(),
            api_key: BOOTSTRAP_API_KEY.to_string(),
            api_secret: BOOTSTRAP_API_SECRET.to_string(),
            token: Arc::new(RwLock::new(String::new())),
        }
    }

    fn create_auth_header(&self) -> String {
        let credentials = format!("{}:{}", self.api_key, self.api_secret);
        let encoded_credentials = BASE64_STANDARD.encode(credentials.as_bytes());
        format!("Basic {}", encoded_credentials)
    }

    pub async fn acquire_token(
        &self,
        user_handle: String,
        display_name: String,
    ) -> Result<TokenResponse> {
        let url = format!("{}/sdk/v1/tokens/issue", self.base_url);
        let auth_header = self.create_auth_header();
        
        let request_body = TokenRequest {
            account_type: Some("guest".to_string()),
            user_handle: user_handle.clone(),
            display_name: display_name.clone(),
        };

        log::info!("Acquiring token for user_handle: {}", user_handle);

        let response = self
            .client
            .post(&url)
            .header("Authorization", auth_header)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to send token request")?;

        let status = response.status();
        log::info!("Token request response status: {}", status);

        if status.is_success() {
            let token_response: TokenResponse = response
                .json()
                .await
                .context("Failed to parse token response")?;
            
            log::info!("Successfully acquired token for user: {}", token_response.user_id);
            Ok(token_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Token acquisition failed with status {}: {}", status, error_text);
            anyhow::bail!("Token acquisition failed ({}): {}", status, error_text);
        }
    }


    pub async fn get_current_user(&self, token: &str) -> Result<CurrentUserResponse> {
        let url = format!("{}/api/v1/users/me", self.base_url);
        
        log::info!("Fetching current user info");

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to fetch current user")?;

        let status = response.status();
        
        if status.is_success() {
            let user_response: CurrentUserResponse = response
                .json()
                .await
                .context("Failed to parse current user response")?;
            
            log::info!("Successfully fetched current user: username = {:?}", user_response.username);
            Ok(user_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to fetch current user with status {}: {}", status, error_text);
            anyhow::bail!("Failed to fetch current user ({}): {}", status, error_text);
        }
    }
    pub async fn get_grid_permissions(&self, token: &str, grid_id: String) -> Result<GridPermissions> {
        let url = format!("{}/api/v1/grids/{}/permissions", self.base_url, grid_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to get grid permissions: {}", response.status()));
        }

        let permissions: GridPermissions = response.json().await?;
        Ok(permissions)
    }

    // Update grid settings (admin/owner only)
    pub async fn update_grid_settings(&self, token: &str, grid_id: String, settings: UpdateGridSettingsRequest) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/settings", self.base_url, grid_id);
        
        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&settings)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to update grid settings: {}", response.status()));
        }

        Ok(())
    }

    // Update member permissions (admin/owner only)
    pub async fn update_member_permissions(&self, token: &str, grid_id: String, member_id: String, permissions: UpdateMemberPermissionsRequest) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/members/{}/permissions", self.base_url, grid_id, member_id);
        
        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&permissions)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to update member permissions: {}", response.status()));
        }

        Ok(())
    }

    // Get process permissions
    pub async fn get_process_permissions(&self, token: &str, process_id: String) -> Result<ProcessPermissions> {
        let url = format!("{}/api/v1/processes/{}/permissions", self.base_url, process_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to get process permissions: {}", response.status()));
        }

        let permissions: ProcessPermissions = response.json().await?;
        Ok(permissions)
    }

    // Get grid audit log (admin/owner only)
    pub async fn get_grid_audit_log(&self, token: &str, grid_id: String, request: GetAuditLogRequest) -> Result<GetAuditLogResponse> {
        let url = format!("{}/api/v1/grids/{}/audit-log", self.base_url, grid_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to get audit log: {}", response.status()));
        }

        let audit_log: GetAuditLogResponse = response.json().await?;
        Ok(audit_log)
    }

    pub async fn promote_account(
        &self,
        token: &str,
        supabase_token: String,
    ) -> Result<PromotionResponse> {
        let url = format!("{}/api/v1/auth/promote", self.base_url);
        
        let request_body = PromotionRequest {
            supabase_access_token: supabase_token,
        };

        log::info!("Promoting account to full status");

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to send promotion request")?;

        let status = response.status();
        log::info!("Promotion request response status: {}", status);

        if status.is_success() {
            let promotion_response: PromotionResponse = response
                .json()
                .await
                .context("Failed to parse promotion response")?;
            
            log::info!("Account promotion response: {}", promotion_response.status);
            Ok(promotion_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Account promotion failed with status {}: {}", status, error_text);
            anyhow::bail!("Account promotion failed ({}): {}", status, error_text);
        }
    }

    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/health", self.base_url);
        
        log::info!("Attempting health check to URL: {}", url);
        
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to perform health check")?;
        
        let status = response.status();
        log::info!("Health check response status: {}", status);
        
        Ok(response.status().is_success())
    }

    pub async fn register_grid_process(&self, token: &str, grid_id: String, request: serde_json::Value) -> Result<(), anyhow::Error> {
        let url = format!("{}/api/grids/{}/processes", self.base_url, grid_id);

        log::info!("Registering grid process: {:?}", request);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to register grid process")?;

        let status = response.status();

        if status.is_success() {
            log::info!("Successfully registered grid process");
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            log::error!("Failed to register grid process with status {}: {}", status, error_text);
            anyhow::bail!("Failed to register grid process ({}): {}", status, error_text);
        }
    }

    pub async fn update_process_status(&self, token: &str, grid_id: String, request: serde_json::Value) -> Result<(), anyhow::Error> {
        let url = format!("{}/api/grids/{}/processes/status", self.base_url, grid_id);

        log::debug!("Updating process status: {:?}", request);

        let response = self
            .client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to update process status")?;

        let status = response.status();

        if status.is_success() {
            log::debug!("Successfully updated process status");
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            log::error!("Failed to update process status with status {}: {}", status, error_text);
            anyhow::bail!("Failed to update process status ({}): {}", status, error_text);
        }
    }
    
    // Grid API methods (replaces friend methods)
    pub async fn create_grid(&self, token: &str, request: CreateGridRequest) -> Result<CreateGridResponse> {
        let url = format!("{}/api/v1/grids", self.base_url);
        
        log::info!("Creating grid: {}", request.name);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to create grid")?;

        let status = response.status();
        
        if status.is_success() {
            let grid_response: CreateGridResponse = response
                .json()
                .await
                .context("Failed to parse create grid response")?;
            
            log::info!("Successfully created grid: {}", grid_response.grid.name);
            Ok(grid_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to create grid with status {}: {}", status, error_text);
            anyhow::bail!("Failed to create grid ({}): {}", status, error_text);
        }
    }

    pub async fn get_my_grids(&self, token: &str) -> Result<GetMyGridsResponse> {
        let url = format!("{}/api/v1/grids", self.base_url);
        
        log::info!("Fetching user's grids");

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to fetch grids")?;

        let status = response.status();
        log::info!("🔍 Response status: {}", status);
        
        if status.is_success() {
            // Get the raw text first to see what we're actually receiving
            let response_text = response
                .text()
                .await
                .context("Failed to read response body")?;
            
            log::info!("🔍 Raw JSON response from Go backend: {}", response_text);
            
            // Now try to parse it
            match serde_json::from_str::<GetMyGridsResponse>(&response_text) {
                Ok(grids_response) => {
                    log::info!("✅ Successfully parsed {} grids", grids_response.grids.len());
                    Ok(grids_response)
                }
                Err(parse_error) => {
                    log::error!("❌ JSON parsing failed: {}", parse_error);
                    log::error!("❌ Failed to parse this JSON: {}", response_text);
                    
                    // Let's also try to parse it as a generic Value to see the structure
                    match serde_json::from_str::<serde_json::Value>(&response_text) {
                        Ok(json_value) => {
                            log::info!("🔍 Raw JSON structure: {:#}", json_value);
                        }
                        Err(_) => {
                            log::error!("❌ Response is not valid JSON at all");
                        }
                    }
                    
                    anyhow::bail!("Failed to parse grids response: {}", parse_error)
                }
            }
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to fetch grids with status {}: {}", status, error_text);
            anyhow::bail!("Failed to fetch grids ({}): {}", status, error_text);
        }
    }

    pub async fn get_grid_details(&self, token: &str, grid_id: String) -> Result<GridDetailsResponse> {
        let url = format!("{}/api/v1/grids/{}", self.base_url, grid_id);
        
        log::info!("Fetching grid details for: {}", grid_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to fetch grid details")?;

        let status = response.status();
        
        if status.is_success() {
            let details_response: GridDetailsResponse = response
                .json()
                .await
                .context("Failed to parse grid details response")?;
            
            log::info!("Successfully fetched details for grid: {}", details_response.grid.name);
            Ok(details_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to fetch grid details with status {}: {}", status, error_text);
            anyhow::bail!("Failed to fetch grid details ({}): {}", status, error_text);
        }
    }

    pub async fn invite_to_grid(&self, token: &str, grid_id: String, request: InviteToGridRequest) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/invite", self.base_url, grid_id);
        
        log::info!("Inviting user to grid: {}", grid_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to invite user to grid")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully invited user to grid: {}", grid_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to invite user to grid with status {}: {}", status, error_text);
            anyhow::bail!("Failed to invite user to grid ({}): {}", status, error_text);
        }
    }

    pub async fn join_grid(&self, token: &str, request: JoinGridRequest) -> Result<Grid> {
        let url = format!("{}/api/v1/grids/join", self.base_url);
        
        log::info!("Joining grid by invite code");

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to join grid")?;

        let status = response.status();
        
        if status.is_success() {
            let grid: Grid = response
                .json()
                .await
                .context("Failed to parse join grid response")?;
            
            log::info!("Successfully joined grid: {}", grid.name);
            Ok(grid)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to join grid with status {}: {}", status, error_text);
            anyhow::bail!("Failed to join grid ({}): {}", status, error_text);
        }
    }

    // Grid invitations endpoints
    pub async fn get_grid_invitations(&self,    _token: &str) -> Result<Vec<GridInvitation>> {
        // This would call something like GET /api/v1/grids/invitations
        // For now, return empty vec
        log::info!("Grid invitations endpoint not yet implemented");
        Ok(Vec::new())
    }

    pub async fn accept_grid_invitation(&self, _token: &str, grid_id: String) -> Result<()> {
        // This would call something like POST /api/v1/grids/{id}/accept
        log::info!("Accept grid invitation endpoint not yet implemented for grid: {}", grid_id);
        Ok(())
    }

    pub async fn decline_grid_invitation(&self, _token: &str, grid_id: String) -> Result<()> {
        // This would call something like POST /api/v1/grids/{id}/decline
        log::info!("Decline grid invitation endpoint not yet implemented for grid: {}", grid_id);
        Ok(())
    }

    // User search (unchanged)
    pub async fn search_users(&self, token: &str, query: String, limit: Option<u32>) -> Result<SearchUsersResponse> {
        let url = format!("{}/api/v1/users/search", self.base_url);
        
        let request_body = SearchUsersRequest {
            query: query.clone(),
            limit,
        };

        log::info!("Searching users with query: {}", query);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to search users")?;

        let status = response.status();
        
        if status.is_success() {
            let search_response: SearchUsersResponse = response
                .json()
                .await
                .context("Failed to parse search response")?;
            
            log::info!("Search returned {} users", search_response.total);
            Ok(search_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to search users with status {}: {}", status, error_text);
            anyhow::bail!("Failed to search users ({}): {}", status, error_text);
        }
    }

    pub fn get_websocket_url(&self, token: &str) -> String {
        format!("wss://api.roguegrid9.com/ws?token={}", token)
    }

    // Grid session status and host management
    pub async fn get_grid_status(&self, token: &str, grid_id: String) -> Result<GridSessionStatus> {
        let url = format!("{}/api/v1/grids/{}/status", self.base_url, grid_id);
        
        log::info!("Getting grid status for: {}", grid_id);

        let response = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to get grid status")?;

        let status = response.status();
        
        if status.is_success() {
            let grid_status: crate::p2p::GridSessionStatus = response
                .json()
                .await
                .context("Failed to parse grid status response")?;
            
            log::info!("Grid {} status: {}", grid_id, grid_status.session_state);
            Ok(grid_status)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to get grid status with status {}: {}", status, error_text);
            anyhow::bail!("Failed to get grid status ({}): {}", status, error_text);
        }
    }

    pub async fn claim_grid_host(&self, token: &str, grid_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/claim-host", self.base_url, grid_id);
        
        log::info!("Claiming host for grid: {}", grid_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to claim host")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully claimed host for grid: {}", grid_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            match status.as_u16() {
                403 => anyhow::bail!("Insufficient permissions to host this grid"),
                409 => anyhow::bail!("Grid is already being hosted by someone else"),
                _ => {
                    log::error!("Failed to claim host with status {}: {}", status, error_text);
                    anyhow::bail!("Failed to claim host ({}): {}", status, error_text);
                }
            }
        }
    }

    pub async fn release_grid_host(&self, token: &str, grid_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/release-host", self.base_url, grid_id);
        
        log::info!("Releasing host for grid: {}", grid_id);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to release host")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully released host for grid: {}", grid_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to release host with status {}: {}", status, error_text);
            anyhow::bail!("Failed to release host ({}): {}", status, error_text);
        }
    }

    pub async fn send_grid_heartbeat(&self, token: &str, grid_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/heartbeat", self.base_url, grid_id);

        // Don't log every heartbeat to avoid spam
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to send heartbeat")?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            log::error!("Failed to send heartbeat with status {}: {}", status, error_text);
            anyhow::bail!("Failed to send heartbeat ({}): {}", status, error_text);
        }

        Ok(())
    }

    pub async fn send_process_heartbeat(&self, token: &str, grid_id: String, process_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/processes/{}/heartbeat", self.base_url, grid_id, process_id);

        // Don't log every heartbeat to avoid spam
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to send process heartbeat")?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            log::error!("Failed to send process heartbeat with status {}: {}", status, error_text);
            anyhow::bail!("Failed to send process heartbeat ({}): {}", status, error_text);
        }

        Ok(())
    }

    pub async fn generate_code(
        &self,
        token: &str,
        grid_id: &str,
        request: GenerateCodeRequest,
    ) -> Result<GenerateCodeResponse> {
        let url = format!("{}/api/v1/grids/{}/codes", self.base_url, grid_id);
        
        log::info!("Generating code for resource type: {:?}", request.resource_type);

        let response = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to generate resource code")?;

        let status = response.status();
        
        if status.is_success() {
            let code_response: GenerateCodeResponse = response
                .json()
                .await
                .context("Failed to parse generate code response")?;
            
            log::info!("Successfully generated code: {}", code_response.code.access_code);
            Ok(code_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to generate code with status {}: {}", status, error_text);
            anyhow::bail!("Failed to generate code ({}): {}", status, error_text);
        }
    }

    // Use an access code
    pub async fn use_code(
        &self,
        token: &str,
        grid_id: &str,
        request: UseCodeRequest,
    ) -> Result<UseCodeResponse> {
        let url = format!("{}/api/v1/grids/{}/codes/use", self.base_url, grid_id);
        
        log::info!("Using access code: {}", request.access_code);

        let response = self
            .client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to use access code")?;

        let status = response.status();
        
        if status.is_success() {
            let use_response: UseCodeResponse = response
                .json()
                .await
                .context("Failed to parse use code response")?;
            
            log::info!("Code usage result: {} - {}", use_response.success, use_response.message);
            Ok(use_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to use code with status {}: {}", status, error_text);
            anyhow::bail!("Failed to use code ({}): {}", status, error_text);
        }
    }

    // List codes in a grid
    pub async fn list_codes(
        &self,
        token: &str,
        grid_id: &str,
        request: ListCodesRequest,
    ) -> Result<ListCodesResponse> {
        let mut url = format!("{}/api/v1/grids/{}/codes", self.base_url, grid_id);
        
        // Add query parameters
        let mut query_params = Vec::new();
        if let Some(resource_type) = &request.resource_type {
            query_params.push(format!("resource_type={:?}", resource_type));
        }
        if let Some(resource_id) = &request.resource_id {
            query_params.push(format!("resource_id={}", resource_id));
        }
        if let Some(active_only) = request.active_only {
            query_params.push(format!("active_only={}", active_only));
        }
        if let Some(limit) = request.limit {
            query_params.push(format!("limit={}", limit));
        }
        if let Some(offset) = request.offset {
            query_params.push(format!("offset={}", offset));
        }
        
        if !query_params.is_empty() {
            url.push('?');
            url.push_str(&query_params.join("&"));
        }

        log::info!("Listing codes for grid: {}", grid_id);

        let response = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to list codes")?;

        let status = response.status();
        
        if status.is_success() {
            let list_response: ListCodesResponse = response
                .json()
                .await
                .context("Failed to parse list codes response")?;
            
            log::info!("Retrieved {} codes", list_response.codes.len());
            Ok(list_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to list codes with status {}: {}", status, error_text);
            anyhow::bail!("Failed to list codes ({}): {}", status, error_text);
        }
    }

    // Get specific code details
    pub async fn get_code(
        &self,
        token: &str,
        grid_id: &str,
        code_id: &str,
    ) -> Result<ResourceAccessCode> {
        let url = format!("{}/api/v1/grids/{}/codes/{}", self.base_url, grid_id, code_id);
        
        log::info!("Getting code details for: {}", code_id);

        let response = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get code details")?;

        let status = response.status();
        
        if status.is_success() {
            let code: ResourceAccessCode = response
                .json()
                .await
                .context("Failed to parse code details response")?;
            
            log::info!("Retrieved code: {}", code.access_code);
            Ok(code)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to get code with status {}: {}", status, error_text);
            anyhow::bail!("Failed to get code ({}): {}", status, error_text);
        }
    }

    // Revoke a code
    pub async fn revoke_code(
        &self,
        token: &str,
        grid_id: &str,
        code_id: &str,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/codes/{}/revoke", self.base_url, grid_id, code_id);
        
        log::info!("Revoking code: {}", code_id);

        let response = self
            .client
            .post(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to revoke code")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully revoked code: {}", code_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to revoke code with status {}: {}", status, error_text);
            anyhow::bail!("Failed to revoke code ({}): {}", status, error_text);
        }
    }

    // Get code usage history
    pub async fn get_code_usage_history(
        &self,
        token: &str,
        grid_id: &str,
        code_id: &str,
        request: CodeUsageHistoryRequest,
    ) -> Result<CodeUsageHistoryResponse> {
        let mut url = format!("{}/api/v1/grids/{}/codes/{}/usage", self.base_url, grid_id, code_id);
        
        // Add query parameters
        let mut query_params = Vec::new();
        if let Some(limit) = request.limit {
            query_params.push(format!("limit={}", limit));
        }
        if let Some(offset) = request.offset {
            query_params.push(format!("offset={}", offset));
        }
        
        if !query_params.is_empty() {
            url.push('?');
            url.push_str(&query_params.join("&"));
        }

        log::info!("Getting usage history for code: {}", code_id);

        let response = self
            .client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get code usage history")?;

        let status = response.status();
        
        if status.is_success() {
            let history_response: CodeUsageHistoryResponse = response
                .json()
                .await
                .context("Failed to parse usage history response")?;
            
            log::info!("Retrieved {} usage entries", history_response.entries.len());
            Ok(history_response)
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to get usage history with status {}: {}", status, error_text);
            anyhow::bail!("Failed to get usage history ({}): {}", status, error_text);
        }
    }

    // Convenience methods for specific resource types

    // Share a process via code
    pub async fn share_process(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
        options: ProcessCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let mut permissions = serde_json::Map::new();
        if let Some(can_view) = options.can_view {
            permissions.insert("can_view".to_string(), serde_json::Value::Bool(can_view));
        }
        if let Some(can_connect) = options.can_connect {
            permissions.insert("can_connect".to_string(), serde_json::Value::Bool(can_connect));
        }
        if let Some(can_send_commands) = options.can_send_commands {
            permissions.insert("can_send_commands".to_string(), serde_json::Value::Bool(can_send_commands));
        }
        if let Some(can_restart) = options.can_restart {
            permissions.insert("can_restart".to_string(), serde_json::Value::Bool(can_restart));
        }
        if let Some(can_view_logs) = options.can_view_logs {
            permissions.insert("can_view_logs".to_string(), serde_json::Value::Bool(can_view_logs));
        }

        let mut metadata = serde_json::Map::new();
        if let Some(session_duration) = options.session_duration_minutes {
            metadata.insert("session_duration_minutes".to_string(), serde_json::Value::Number(session_duration.into()));
        }

        let request = GenerateCodeRequest {
            resource_type: ResourceType::Process,
            resource_id: process_id.to_string(),
            code_name: options.code_name,
            expiry_minutes: options.expiry_minutes,
            usage_limit: options.usage_limit,
            permissions: Some(serde_json::Value::Object(permissions)),
            metadata: Some(serde_json::Value::Object(metadata)),
        };

        self.generate_code(token, grid_id, request).await
    }

    // Create grid invite code
    pub async fn create_invite_code(
        &self,
        token: &str,
        grid_id: &str,
        options: GridInviteCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let mut permissions = serde_json::Map::new();
        if let Some(role) = &options.role {
            permissions.insert("role".to_string(), serde_json::Value::String(role.clone()));
        }
        if let Some(auto_approve) = options.auto_approve {
            permissions.insert("auto_approve".to_string(), serde_json::Value::Bool(auto_approve));
        }
        if let Some(skip_onboarding) = options.skip_onboarding {
            permissions.insert("skip_onboarding".to_string(), serde_json::Value::Bool(skip_onboarding));
        }

        let mut metadata = serde_json::Map::new();
        if let Some(welcome_message) = &options.welcome_message {
            metadata.insert("welcome_message".to_string(), serde_json::Value::String(welcome_message.clone()));
        }

        let request = GenerateCodeRequest {
            resource_type: ResourceType::GridInvite,
            resource_id: grid_id.to_string(),
            code_name: options.code_name,
            expiry_minutes: options.expiry_minutes,
            usage_limit: options.usage_limit,
            permissions: Some(serde_json::Value::Object(permissions)),
            metadata: Some(serde_json::Value::Object(metadata)),
        };

        self.generate_code(token, grid_id, request).await
    }

    // Share a channel via code
    pub async fn share_channel(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
        channel_type: &str,
        options: ChannelCodeOptions,
    ) -> Result<GenerateCodeResponse> {
        let resource_type = match channel_type {
            "voice" => ResourceType::ChannelVoice,
            "text" => ResourceType::ChannelText,
            "video" => ResourceType::ChannelVideo,
            _ => return Err(anyhow::anyhow!("Invalid channel type: {}", channel_type)),
        };

        let mut permissions = serde_json::Map::new();
        if let Some(can_join) = options.can_join {
            permissions.insert("can_join".to_string(), serde_json::Value::Bool(can_join));
        }
        if let Some(can_speak) = options.can_speak {
            permissions.insert("can_speak".to_string(), serde_json::Value::Bool(can_speak));
        }
        if let Some(can_moderate) = options.can_moderate {
            permissions.insert("can_moderate".to_string(), serde_json::Value::Bool(can_moderate));
        }
        if let Some(can_screen_share) = options.can_screen_share {
            permissions.insert("can_screen_share".to_string(), serde_json::Value::Bool(can_screen_share));
        }
        if let Some(can_record) = options.can_record {
            permissions.insert("can_record".to_string(), serde_json::Value::Bool(can_record));
        }

        let mut metadata = serde_json::Map::new();
        if let Some(session_duration) = options.session_duration_minutes {
            metadata.insert("session_duration_minutes".to_string(), serde_json::Value::Number(session_duration.into()));
        }

        let request = GenerateCodeRequest {
            resource_type,
            resource_id: channel_id.to_string(),
            code_name: options.code_name,
            expiry_minutes: options.expiry_minutes,
            usage_limit: options.usage_limit,
            permissions: Some(serde_json::Value::Object(permissions)),
            metadata: Some(serde_json::Value::Object(metadata)),
        };

        self.generate_code(token, grid_id, request).await
    }

        pub async fn update_username(&self, token: &str, username: String) -> Result<()> {
        let url = format!("{}/api/v1/users/username", self.base_url);
        
        let request_body = serde_json::json!({
            "username": username
        });
        
        let response = self.client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to send update username request")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            
            if status == 409 {
                anyhow::bail!("Username already taken");
            }
            
            anyhow::bail!("Username update failed with status {}: {}", status, body);
        }
        
        Ok(())
    }

    /// Update user display name
    pub async fn update_display_name(&self, token: &str, display_name: String) -> Result<()> {
        let url = format!("{}/api/v1/users/display-name", self.base_url);

        let request_body = serde_json::json!({
            "display_name": display_name
        });

        let response = self.client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to send update display name request")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Display name update failed with status {}: {}", status, body);
        }

        Ok(())
    }

    /// Accept Terms of Service
    pub async fn accept_tos(&self, token: &str, tos_version: String) -> Result<()> {
        let url = format!("{}/api/v1/users/accept-tos", self.base_url);

        let request_body = serde_json::json!({
            "tos_version": tos_version
        });

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to send accept TOS request")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("TOS acceptance failed with status {}: {}", status, body);
        }

        Ok(())
    }

    /// Check username availability
    pub async fn check_username_availability(&self, username: String) -> Result<CheckUsernameAvailabilityResponse> {
        let url = format!("{}/api/v1/users/username/check?username={}",
                         self.base_url,
                         urlencoding::encode(&username));

        // Use shorter timeout for username checks (5 seconds instead of 30)
        let client_with_timeout = Client::builder()
            .timeout(Duration::from_secs(5))
            .danger_accept_invalid_certs(true)
            .build()
            .context("Failed to create HTTP client")?;

        let response = client_with_timeout
            .get(&url)
            .send()
            .await
            .context("Failed to check username availability - server may be unreachable")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Username availability check failed with status {}: {}", status, body);
        }

        let availability_response: CheckUsernameAvailabilityResponse = response
            .json()
            .await
            .context("Failed to parse username availability response")?;

        Ok(availability_response)
    }
    
    /// Promote account with optional username
    pub async fn promote_account_with_username(
        &self,
        token: &str,
        supabase_access_token: String,
        username: Option<String>
    ) -> Result<PromotionResponse> {
        let url = format!("{}/api/v1/auth/promote", self.base_url);
        
        let mut request_body = serde_json::json!({
            "supabase_access_token": supabase_access_token
        });
        
        if let Some(username) = username {
            request_body["username"] = serde_json::Value::String(username);
        }
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to promote account")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            
            if status == 409 {
                anyhow::bail!("Username already taken");
            }
            
            anyhow::bail!("Account promotion failed with status {}: {}", status, body);
        }
        
        let promotion_response: PromotionResponse = response
            .json()
            .await
            .context("Failed to parse promotion response")?;
        
        Ok(promotion_response)
    }

    pub async fn delete_with_body<T: serde::Serialize>(&self, endpoint: &str, body: Option<&T>) -> Result<serde_json::Value> {
        let mut request = self.client
            .delete(&format!("{}{}", self.base_url, endpoint))
            .header("Authorization", format!("Bearer {}", self.token.read().await));

        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .json(body);
        }

        let response = request
            .send()
            .await
            .context("Failed to send DELETE request")?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await.context("Failed to parse JSON response")?;
            Ok(json)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            anyhow::bail!("API request failed: {} - {}", status, error_text);
        }
    }

    pub async fn get<T: for<'de> serde::Deserialize<'de>>(&self, endpoint: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, endpoint);
        let token = self.token.read().await;
        
        let response = self.client
            .get(&url)
            .bearer_auth(&*token)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("GET request failed: {} - {}", status, error_text);
        }

        Ok(response.json().await?)
    }

    pub async fn post<T, R>(&self, endpoint: &str, body: Option<&T>) -> Result<R>
    where
        T: serde::Serialize,
        R: for<'de> serde::Deserialize<'de>,
    {
        let url = format!("{}{}", self.base_url, endpoint);
        let token = self.token.read().await;
        
        let mut request = self.client
            .post(&url)
            .bearer_auth(&*token);

        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("POST request failed: {} - {}", status, error_text);
        }

        Ok(response.json().await?)
    }

    pub async fn put<T, R>(&self, endpoint: &str, body: Option<&T>) -> Result<R>
    where
        T: serde::Serialize,
        R: for<'de> serde::Deserialize<'de>,
    {
        let url = format!("{}{}", self.base_url, endpoint);
        let token = self.token.read().await;
        
        let mut request = self.client
            .put(&url)
            .bearer_auth(&*token);

        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("PUT request failed: {} - {}", status, error_text);
        }

        Ok(response.json().await?)
    }

    // Voice Channel API Methods
    pub async fn join_voice_channel(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
    ) -> Result<serde_json::Value> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/join",
                        self.base_url, grid_id, channel_id);

        log::info!("Joining voice channel {} in grid {}", channel_id, grid_id);

        // Build request body
        let request_body = serde_json::json!({
            "audio_quality": "medium",
            "start_muted": false,
            "start_deafened": false,
            "connection_type": "mesh"
        });

        let response = self.client
            .post(&url)
            .bearer_auth(token)
            .json(&request_body)
            .send()
            .await
            .context("Failed to join voice channel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to join voice channel ({}): {}", status, error_text);
        }

        let result: serde_json::Value = response.json().await
            .context("Failed to parse join voice channel response")?;

        log::info!("Successfully joined voice channel {}", channel_id);
        Ok(result)
    }

    pub async fn leave_voice_channel(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/leave", 
                        self.base_url, grid_id, channel_id);
        
        log::info!("Leaving voice channel {} in grid {}", channel_id, grid_id);

        let response = self.client
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to leave voice channel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to leave voice channel ({}): {}", status, error_text);
        }

        log::info!("Successfully left voice channel {}", channel_id);
        Ok(())
    }

    pub async fn get_voice_participants(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
    ) -> Result<serde_json::Value> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/participants", 
                        self.base_url, grid_id, channel_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get voice participants")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get voice participants ({}): {}", status, error_text);
        }

        let participants: serde_json::Value = response.json().await
            .context("Failed to parse voice participants response")?;
        
        Ok(participants)
    }

    pub async fn update_voice_state(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
        state_update: serde_json::Value,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/state", 
                        self.base_url, grid_id, channel_id);
        
        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&state_update)
            .send()
            .await
            .context("Failed to update voice state")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to update voice state ({}): {}", status, error_text);
        }

        Ok(())
    }

    pub async fn set_speaking_state(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
        is_speaking: bool,
        audio_level: Option<f32>,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/speaking", 
                        self.base_url, grid_id, channel_id);
        
        let mut speaking_data = serde_json::json!({
            "is_speaking": is_speaking
        });
        
        if let Some(level) = audio_level {
            speaking_data["audio_level"] = serde_json::Value::Number(
                serde_json::Number::from_f64(level as f64).unwrap_or(serde_json::Number::from(0))
            );
        }

        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&speaking_data)
            .send()
            .await
            .context("Failed to set speaking state")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to set speaking state ({}): {}", status, error_text);
        }

        Ok(())
    }

    pub async fn get_voice_settings(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
    ) -> Result<serde_json::Value> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/settings", 
                        self.base_url, grid_id, channel_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get voice settings")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get voice settings ({}): {}", status, error_text);
        }

        let settings: serde_json::Value = response.json().await
            .context("Failed to parse voice settings response")?;
        
        Ok(settings)
    }

    pub async fn update_voice_settings(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
        settings: serde_json::Value,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/settings", 
                        self.base_url, grid_id, channel_id);
        
        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&settings)
            .send()
            .await
            .context("Failed to update voice settings")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to update voice settings ({}): {}", status, error_text);
        }

        Ok(())
    }

    pub async fn get_voice_stats(
        &self,
        token: &str,
        grid_id: &str,
        channel_id: &str,
    ) -> Result<serde_json::Value> {
        let url = format!("{}/api/v1/grids/{}/channels/{}/voice/stats", 
                        self.base_url, grid_id, channel_id);
        
        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get voice stats")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get voice stats ({}): {}", status, error_text);
        }

        let stats: serde_json::Value = response.json().await
            .context("Failed to parse voice stats response")?;
        
        Ok(stats)
    }


    pub async fn delete_grid_process(&self, token: &str, grid_id: String, process_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/processes/{}", self.base_url, grid_id, process_id);
        
        log::info!("Deleting process {} from grid {}", process_id, grid_id);

        let response = self
            .client
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to delete process")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully deleted process: {}", process_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to delete process with status {}: {}", status, error_text);
            anyhow::bail!("Failed to delete process ({}): {}", status, error_text);
        }
    }

    pub async fn delete_grid_channel(&self, token: &str, grid_id: String, channel_id: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/channels/{}", self.base_url, grid_id, channel_id);
        
        log::info!("Deleting channel {} from grid {}", channel_id, grid_id);

        let response = self
            .client
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to delete channel")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully deleted channel: {}", channel_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to delete channel with status {}: {}", status, error_text);
            anyhow::bail!("Failed to delete channel ({}): {}", status, error_text);
        }
    }

    pub async fn update_member_role(&self, token: &str, grid_id: String, user_id: String, new_role: String) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/members/{}/role", self.base_url, grid_id, user_id);
        
        let request_body = serde_json::json!({
            "new_role": new_role
        });
        
        log::info!("Updating member {} role to {} in grid {}", user_id, new_role, grid_id);

        let response = self
            .client
            .put(&url)
            .bearer_auth(token)
            .json(&request_body)
            .send()
            .await
            .context("Failed to update member role")?;

        let status = response.status();
        
        if status.is_success() {
            log::info!("Successfully updated member role: {} to {}", user_id, new_role);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            
            log::error!("Failed to update member role with status {}: {}", status, error_text);
            anyhow::bail!("Failed to update member role ({}): {}", status, error_text);
        }
    }

    pub async fn update_grid_basic_info(&self, token: &str, grid_id: String, name: String, description: Option<String>) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}", self.base_url, grid_id);

        let request_body = serde_json::json!({
            "name": name,
            "description": description
        });

        log::info!("Updating grid {} basic info", grid_id);

        let response = self
            .client
            .put(&url)
            .bearer_auth(token)
            .json(&request_body)
            .send()
            .await
            .context("Failed to update grid basic info")?;

        let status = response.status();

        if status.is_success() {
            log::info!("Successfully updated grid basic info for grid: {}", grid_id);
            Ok(())
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            log::error!("Failed to update grid basic info with status {}: {}", status, error_text);
            anyhow::bail!("Failed to update grid basic info ({}): {}", status, error_text);
        }
    }

     // Register a RogueGrid9-managed container with the server
    pub async fn register_container_process(&self, token: &str, grid_id: String, request: RegisterContainerRequest) -> Result<ContainerProcessResponse, anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers", self.base_url, grid_id);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to register container: {}", error_text));
        }

        let container_response: ContainerProcessResponse = response.json().await?;
        Ok(container_response)
    }

    // Get all containers for a grid
    pub async fn get_grid_containers(&self, token: &str, grid_id: String) -> Result<ListContainersResponse, anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers", self.base_url, grid_id);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to get containers: {}", error_text));
        }

        let containers_response: ListContainersResponse = response.json().await?;
        Ok(containers_response)
    }

    // Update container status
    pub async fn update_container_status(&self, token: &str, grid_id: String, process_uuid: String, status: String) -> Result<(), anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers/{}/status", self.base_url, grid_id, process_uuid);
        
        let request = UpdateContainerStatusRequest { status, metadata: None };
        
        let response = self.client
            .put(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to update container status: {}", error_text));
        }

        Ok(())
    }

    // Delete a container
    pub async fn delete_container_process(&self, token: &str, grid_id: String, process_uuid: String) -> Result<(), anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers/{}", self.base_url, grid_id, process_uuid);
        
        let response = self.client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to delete container: {}", error_text));
        }

        Ok(())
    }

    // Track container connections for backup system
    pub async fn track_container_connection(&self, token: &str, grid_id: String, process_uuid: String, action: String, connection_type: String, p2p_connection_id: String) -> Result<(), anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers/{}/connections", self.base_url, grid_id, process_uuid);
        
        let request = TrackConnectionRequest {
            connection_type,
            p2p_connection_id,
            action,
        };
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to track connection: {}", error_text));
        }

        Ok(())
    }

    // Get container statistics
    pub async fn get_container_stats(&self, token: &str, grid_id: String) -> Result<ContainerStatsResponse, anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/container-stats", self.base_url, grid_id);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to get container stats: {}", error_text));
        }

        let stats_response: ContainerStatsResponse = response.json().await?;
        Ok(stats_response)
    }

    // Smart terminal access for container health checking
    pub async fn smart_terminal_access(&self, token: &str, grid_id: String, process_uuid: String) -> Result<serde_json::Value, anyhow::Error> {
        let url = format!("{}/api/v1/grids/{}/containers/{}/smart-terminal-access", self.base_url, grid_id, process_uuid);
        
        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to perform smart terminal access: {}", error_text));
        }

        let result: serde_json::Value = response.json().await?;
        Ok(result)
    }

    // ===== SIMPLIFIED SHARED PROCESS API METHODS =====

    // Create a shared process with simplified configuration
    pub async fn create_shared_process(
        &self,
        token: &str,
        grid_id: &str,
        request: CreateSharedProcessRequest,
    ) -> Result<CreateSharedProcessResponse> {
        let url = format!("{}/api/v1/grids/{}/shared-processes", self.base_url, grid_id);
        
        log::info!("Creating shared process '{}' in grid {}", request.name, grid_id);

        let response = self.client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to create shared process")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create shared process ({}): {}", status, error_text);
        }

        let result: CreateSharedProcessResponse = response.json().await
            .context("Failed to parse create shared process response")?;
        
        log::info!("Successfully created shared process: {}", result.id);
        Ok(result)
    }

    // Get all shared processes for a grid
    pub async fn get_grid_shared_processes(
        &self,
        token: &str,
        grid_id: &str,
    ) -> Result<GetGridSharedProcessesResponse> {
        let url = format!("{}/api/v1/grids/{}/shared-processes", self.base_url, grid_id);
        
        log::debug!("Getting shared processes for grid {}", grid_id);

        let response = self.client
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get shared processes")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get shared processes ({}): {}", status, error_text);
        }

        let result: GetGridSharedProcessesResponse = response.json().await
            .context("Failed to parse get shared processes response")?;
        
        log::debug!("Retrieved {} shared processes for grid {}", result.processes.len(), grid_id);
        Ok(result)
    }

    // Update shared process status
    pub async fn update_shared_process_status(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
        status: String,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/shared-processes/{}/status", 
                         self.base_url, grid_id, process_id);
        
        let request = UpdateSharedProcessStatusRequest { status: status.clone() };
        
        log::info!("Updating shared process {} status to '{}' in grid {}", 
                  process_id, status, grid_id);

        let response = self.client
            .put(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to update shared process status")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to update shared process status ({}): {}", status, error_text);
        }

        log::info!("Successfully updated shared process status: {}", process_id);
        Ok(())
    }

    // Delete a shared process
    pub async fn delete_shared_process(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
    ) -> Result<()> {
        let url = format!("{}/api/v1/grids/{}/shared-processes/{}", 
                         self.base_url, grid_id, process_id);
        
        log::info!("Deleting shared process {} from grid {}", process_id, grid_id);

        let response = self.client
            .delete(&url)
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to delete shared process")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to delete shared process ({}): {}", status, error_text);
        }

        log::info!("Successfully deleted shared process: {}", process_id);
        Ok(())
    }

    // ===== GRID RELAY METHODS =====

    /// Get relay configuration and status for a specific grid
    pub async fn get_grid_relay_status(
        &self,
        token: &str,
        grid_id: String,
    ) -> Result<GridRelayStatusResponse> {
        log::info!("Fetching relay status for grid: {}", grid_id);

        let response = self.client
            .get(&format!("{}/api/v1/grids/{}/relay", self.base_url, grid_id))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to fetch grid relay status")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to fetch relay status ({}): {}", status, error_text);
        }

        let relay_status: GridRelayStatusResponse = response
            .json()
            .await
            .context("Failed to parse grid relay status response")?;

        log::info!("Successfully fetched relay status for grid: {}", grid_id);
        Ok(relay_status)
    }

    /// Update relay mode for a grid
    pub async fn update_grid_relay_mode(
        &self,
        token: &str,
        grid_id: String,
        relay_mode: String,
    ) -> Result<()> {
        log::info!("Updating relay mode for grid {} to: {}", grid_id, relay_mode);

        let request = UpdateRelayModeRequest { relay_mode };

        let response = self.client
            .put(&format!("{}/api/v1/grids/{}/relay/mode", self.base_url, grid_id))
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await
            .context("Failed to update relay mode")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to update relay mode ({}): {}", status, error_text);
        }

        log::info!("Successfully updated relay mode for grid: {}", grid_id);
        Ok(())
    }

    /// Purchase bandwidth allocation for a grid
    pub async fn purchase_grid_bandwidth(
        &self,
        token: &str,
        grid_id: String,
        bandwidth_gb: i32,
        duration_months: i32,
    ) -> Result<PaymentIntentResponse> {
        log::info!("Creating payment intent for grid {} ({} GB)", grid_id, bandwidth_gb);

        let request = PurchaseBandwidthRequest {
            bandwidth_gb,
            duration_months,
        };

        let response = self.client
            .post(&format!("{}/api/v1/grids/{}/relay/purchase", self.base_url, grid_id))
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await
            .context("Failed to create payment intent")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create payment intent ({}): {}", status, error_text);
        }

        let payment_intent: PaymentIntentResponse = response
            .json()
            .await
            .context("Failed to parse payment intent response")?;

        log::info!("Successfully created payment intent: {}", payment_intent.payment_intent_id);
        Ok(payment_intent)
    }

    /// Report bandwidth usage for a grid
    pub async fn report_bandwidth_usage(
        &self,
        token: &str,
        grid_id: String,
        bytes_sent: i64,
        bytes_received: i64,
    ) -> Result<()> {
        log::info!("Reporting bandwidth usage for grid {}: sent={}, received={}",
                   grid_id, bytes_sent, bytes_received);

        let request = ReportBandwidthUsageRequest {
            bytes_sent,
            bytes_received,
        };

        let response = self.client
            .post(&format!("{}/api/v1/relay/usage/{}", self.base_url, grid_id))
            .header("Authorization", format!("Bearer {}", token))
            .json(&request)
            .send()
            .await
            .context("Failed to report bandwidth usage")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to report bandwidth usage ({}): {}", status, error_text);
        }

        log::info!("Successfully reported bandwidth usage for grid: {}", grid_id);
        Ok(())
    }

    // ============================================================================
    // Process Connection Methods (Guest Connection Flow)
    // ============================================================================

    /// Connect to a process as a guest
    pub async fn connect_to_process(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
        local_port: Option<u16>,
    ) -> Result<serde_json::Value> {
        log::info!("Connecting to process {} in grid {}", process_id, grid_id);

        let request_body = serde_json::json!({
            "local_port": local_port,
        });

        let response = self
            .client
            .post(&format!(
                "{}/api/v1/grids/{}/processes/{}/connect",
                self.base_url, grid_id, process_id
            ))
            .header("Authorization", format!("Bearer {}", token))
            .json(&request_body)
            .send()
            .await
            .context("Failed to connect to process")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to connect to process ({}): {}", status, error_text);
        }

        let connection_info: serde_json::Value = response
            .json()
            .await
            .context("Failed to parse connection response")?;

        log::info!("Successfully connected to process: {}", process_id);
        Ok(connection_info)
    }

    /// Disconnect from a process
    pub async fn disconnect_from_process(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
        connection_id: &str,
    ) -> Result<()> {
        log::info!(
            "Disconnecting from process {} in grid {}",
            process_id,
            grid_id
        );

        let response = self
            .client
            .delete(&format!(
                "{}/api/v1/grids/{}/processes/{}/connections/{}",
                self.base_url, grid_id, process_id, connection_id
            ))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to disconnect from process")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to disconnect from process ({}): {}", status, error_text);
        }

        log::info!("Successfully disconnected from process: {}", process_id);
        Ok(())
    }

    /// Get process availability status
    pub async fn get_process_availability(
        &self,
        token: &str,
        grid_id: &str,
        process_id: &str,
    ) -> Result<serde_json::Value> {
        log::info!("Getting availability for process {} in grid {}", process_id, grid_id);

        let response = self
            .client
            .get(&format!(
                "{}/api/v1/grids/{}/processes/{}/availability",
                self.base_url, grid_id, process_id
            ))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Failed to get process availability")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!(
                "Failed to get process availability ({}): {}",
                status,
                error_text
            );
        }

        let availability: serde_json::Value = response
            .json()
            .await
            .context("Failed to parse availability response")?;

        log::info!("Successfully retrieved process availability: {}", serde_json::to_string_pretty(&availability).unwrap_or_else(|_| "failed to serialize".to_string()));
        Ok(availability)
    }

    // ===== FRP RELAY & TUNNEL METHODS =====

    /// Start FRP relay subscription
    pub async fn start_relay_trial(
        &self,
        token: &str,
        location: Option<String>,
    ) -> Result<RelaySubscription> {
        log::info!("Starting relay subscription with location: {:?}", location);

        let request = StartTrialRequest { location };

        let response = self.client
            .post(&format!("{}/api/v1/relay/trial", self.base_url))
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to start relay subscription")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to start relay trial ({}): {}", status, error_text);
        }

        let subscription: RelaySubscription = response
            .json()
            .await
            .context("Failed to parse relay subscription response")?;

        log::info!("Successfully started relay trial: {:?}", subscription.id);
        Ok(subscription)
    }

    /// Get FRP credentials for authenticated user
    pub async fn get_relay_credentials(
        &self,
        token: &str,
    ) -> Result<GetCredentialsResponse> {
        log::info!("Fetching relay credentials");

        let response = self.client
            .get(&format!("{}/api/v1/relay/credentials", self.base_url))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get relay credentials")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get relay credentials ({}): {}", status, error_text);
        }

        let credentials: GetCredentialsResponse = response
            .json()
            .await
            .context("Failed to parse credentials response")?;

        log::info!("Successfully retrieved relay credentials");
        Ok(credentials)
    }

    /// Create a new public HTTPS tunnel
    pub async fn create_tunnel(
        &self,
        token: &str,
        subdomain: String,
        local_port: u16,
        protocol: String,
    ) -> Result<Tunnel> {
        log::info!("Creating tunnel: {}.roguegrid9.com -> localhost:{}", subdomain, local_port);

        let request = CreateTunnelRequest {
            subdomain,
            local_port,
            protocol,
        };

        let response = self.client
            .post(&format!("{}/api/v1/tunnels", self.base_url))
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to create tunnel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create tunnel ({}): {}", status, error_text);
        }

        let tunnel: Tunnel = response
            .json()
            .await
            .context("Failed to parse tunnel response")?;

        log::info!("Successfully created tunnel: {}", tunnel.id);
        Ok(tunnel)
    }

    /// List all tunnels for authenticated user
    pub async fn list_tunnels(
        &self,
        token: &str,
    ) -> Result<Vec<Tunnel>> {
        log::info!("Listing tunnels");

        let response = self.client
            .get(&format!("{}/api/v1/tunnels", self.base_url))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to list tunnels")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to list tunnels ({}): {}", status, error_text);
        }

        let tunnels: Vec<Tunnel> = response
            .json()
            .await
            .context("Failed to parse tunnels response")?;

        log::info!("Successfully retrieved {} tunnels", tunnels.len());
        Ok(tunnels)
    }

    /// Delete a tunnel
    pub async fn delete_tunnel(
        &self,
        token: &str,
        tunnel_id: String,
    ) -> Result<()> {
        log::info!("Deleting tunnel: {}", tunnel_id);

        let response = self.client
            .delete(&format!("{}/api/v1/tunnels/{}", self.base_url, tunnel_id))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to delete tunnel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to delete tunnel ({}): {}", status, error_text);
        }

        log::info!("Successfully deleted tunnel: {}", tunnel_id);
        Ok(())
    }

    /// Check subdomain availability (public endpoint, no auth required)
    pub async fn check_subdomain(
        &self,
        subdomain: String,
    ) -> Result<SubdomainAvailability> {
        log::info!("Checking subdomain availability: {}", subdomain);

        let response = self.client
            .get(&format!("{}/api/v1/tunnels/check/{}", self.base_url, subdomain))
            .send()
            .await
            .context("Failed to check subdomain")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to check subdomain ({}): {}", status, error_text);
        }

        let availability: SubdomainAvailability = response
            .json()
            .await
            .context("Failed to parse subdomain availability response")?;

        log::info!("Subdomain {} available: {}", subdomain, availability.available);
        Ok(availability)
    }

    // ========================================================================
    // PROCESS-SPECIFIC TUNNEL METHODS
    // ========================================================================

    /// Create a public tunnel for a specific process
    pub async fn create_process_tunnel(
        &self,
        token: &str,
        process_id: &str,
        request: crate::commands::process_tunnel::CreateProcessTunnelRequest,
    ) -> Result<crate::commands::process_tunnel::ProcessTunnel> {
        log::info!("Creating process tunnel for process: {}", process_id);

        let response = self.client
            .post(&format!("{}/api/v1/processes/{}/tunnel", self.base_url, process_id))
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to create process tunnel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create process tunnel ({}): {}", status, error_text);
        }

        let tunnel: crate::commands::process_tunnel::ProcessTunnel = response
            .json()
            .await
            .context("Failed to parse process tunnel response")?;

        log::info!("Successfully created process tunnel: {} -> {}", process_id, tunnel.public_url);
        Ok(tunnel)
    }

    /// Get the tunnel for a specific process (returns None if no tunnel exists)
    pub async fn get_process_tunnel(
        &self,
        token: &str,
        process_id: &str,
    ) -> Result<Option<crate::commands::process_tunnel::ProcessTunnel>> {
        log::info!("Getting process tunnel for process: {}", process_id);

        let response = self.client
            .get(&format!("{}/api/v1/processes/{}/tunnel", self.base_url, process_id))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to get process tunnel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get process tunnel ({}): {}", status, error_text);
        }

        let tunnel: Option<crate::commands::process_tunnel::ProcessTunnel> = response
            .json()
            .await
            .context("Failed to parse process tunnel response")?;

        log::info!("Process tunnel for {}: {:?}", process_id, tunnel.as_ref().map(|t| &t.public_url));
        Ok(tunnel)
    }

    /// Update the subdomain of a process tunnel
    pub async fn update_process_tunnel_subdomain(
        &self,
        token: &str,
        process_id: &str,
        request: crate::commands::process_tunnel::UpdateProcessTunnelRequest,
    ) -> Result<()> {
        log::info!("Updating process tunnel subdomain for process: {}", process_id);

        let response = self.client
            .patch(&format!("{}/api/v1/processes/{}/tunnel", self.base_url, process_id))
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .context("Failed to update process tunnel subdomain")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to update process tunnel subdomain ({}): {}", status, error_text);
        }

        log::info!("Successfully updated process tunnel subdomain for: {}", process_id);
        Ok(())
    }

    /// Delete the tunnel for a specific process
    pub async fn delete_process_tunnel(
        &self,
        token: &str,
        process_id: &str,
    ) -> Result<()> {
        log::info!("Deleting process tunnel for process: {}", process_id);

        let response = self.client
            .delete(&format!("{}/api/v1/processes/{}/tunnel", self.base_url, process_id))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to delete process tunnel")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to delete process tunnel ({}): {}", status, error_text);
        }

        log::info!("Successfully deleted process tunnel for: {}", process_id);
        Ok(())
    }

    /// Check if a tunnel subdomain is available
    pub async fn check_tunnel_subdomain_availability(
        &self,
        token: &str,
        subdomain: &str,
    ) -> Result<bool> {
        log::info!("Checking tunnel subdomain availability: {}", subdomain);

        let response = self.client
            .get(&format!("{}/api/v1/relay/tunnels/check-subdomain/{}", self.base_url, subdomain))
            .bearer_auth(token)
            .send()
            .await
            .context("Failed to check tunnel subdomain availability")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to check subdomain availability ({}): {}", status, error_text);
        }

        #[derive(serde::Deserialize)]
        struct AvailabilityResponse {
            available: bool,
        }

        let availability_response: AvailabilityResponse = response.json().await
            .context("Failed to parse subdomain availability response")?;

        log::info!("Subdomain '{}' availability: {}", subdomain, availability_response.available);
        Ok(availability_response.available)
    }

    /// Report NAT status to the server
    pub async fn report_nat_status(
        &self,
        token: &str,
        nat_type: String,
        needs_relay: bool,
        connection_quality: String,
    ) -> Result<()> {
        log::info!("Reporting NAT status: {} (needs_relay: {})", nat_type, needs_relay);

        let request_body = ReportNATStatusRequest {
            nat_type,
            needs_relay,
            connection_quality,
        };

        let response = self.client
            .post(&format!("{}/api/v1/users/nat-status", self.base_url))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .context("Failed to report NAT status")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            log::warn!("Failed to report NAT status ({}): {}", status, error_text);
            // Don't fail hard on NAT reporting errors - it's not critical
            return Ok(());
        }

        log::info!("Successfully reported NAT status");
        Ok(())
    }
}