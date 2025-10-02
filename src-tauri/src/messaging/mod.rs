// Create this as src-tauri/src/messaging/mod.rs

use crate::api::client::CoordinatorClient;
use crate::api::types::*;
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct MessagingService {
    api_client: Arc<CoordinatorClient>,
    state: Arc<RwLock<MessagingState>>,
}

impl MessagingService {
    pub fn new(api_client: Arc<CoordinatorClient>) -> Self {
        Self {
            api_client,
            state: Arc::new(RwLock::new(MessagingState::default())),
        }
    }

    // ===== CHANNEL MANAGEMENT =====

    /// Create a new text channel in a grid
    pub async fn create_channel(  // CHANGED from create_text_channel
        &self,
        grid_id: &str,
        request: CreateChannelRequest,  // CHANGED from CreateTextChannelRequest
    ) -> Result<ChannelInfo> {
        let endpoint = format!("/api/v1/grids/{}/channels", grid_id);
        let response: serde_json::Value = self
            .api_client
            .post(&endpoint, Some(&request))
            .await
            .context("Failed to create channel")?;

        let channel: ChannelInfo = serde_json::from_value(
            response["channel"].clone()
        ).context("Failed to parse channel response")?;

        // Update local state
        let mut state = self.state.write().await;
        let grid_channels = state.channels.entry(grid_id.to_string()).or_insert_with(Vec::new);
        grid_channels.retain(|c| c.id != channel.id);
        grid_channels.push(channel.clone());

        Ok(channel)
    }

    pub async fn create_text_channel(
        &self,
        grid_id: &str,
        request: CreateTextChannelRequest,
    ) -> Result<ChannelInfo> {
        let endpoint = format!("/api/v1/grids/{}/channels/text", grid_id);  // Changed from /channels to /channels/text
        let response: serde_json::Value = self
            .api_client
            .post(&endpoint, Some(&request))
            .await
            .context("Failed to create text channel")?;

        let channel: ChannelInfo = serde_json::from_value(
            response["channel"].clone()
        ).context("Failed to parse channel response")?;

        // Update local state
        let mut state = self.state.write().await;
        let grid_channels = state.channels.entry(grid_id.to_string()).or_insert_with(Vec::new);
        grid_channels.retain(|c| c.id != channel.id);
        grid_channels.push(channel.clone());

        Ok(channel)
    }

    /// Get all channels in a grid
    pub async fn get_grid_channels(&self, grid_id: &str) -> Result<Vec<ChannelInfo>> {
        let endpoint = format!("/api/v1/grids/{}/channels", grid_id);
        let response: ChannelListResponse = self
            .api_client
            .get(&endpoint)
            .await
            .context("Failed to get grid channels")?;

        // Update local state
        let mut state = self.state.write().await;
        state.channels.insert(grid_id.to_string(), response.channels.clone());
        state.last_updated.insert(grid_id.to_string(), chrono::Utc::now().timestamp() as u64);

        Ok(response.channels)
    }

    /// Get detailed information about a channel
    pub async fn get_channel_details(&self, channel_id: &str) -> Result<ChannelDetailsResponse> {
        let endpoint = format!("/api/v1/channels/{}", channel_id);
        let response: ChannelDetailsResponse = self
            .api_client
            .get(&endpoint)
            .await
            .context("Failed to get channel details")?;

        // Update local state
        let mut state = self.state.write().await;
        state.channel_members.insert(channel_id.to_string(), response.members.clone());

        Ok(response)
    }

    /// Join a channel
    pub async fn join_channel(&self, grid_id: &str, channel_id: &str) -> Result<()> {
        let endpoint = format!("/api/v1/grids/{}/channels/{}/join", grid_id, channel_id);
        let _: serde_json::Value = self
            .api_client
            .post(&endpoint, None::<&()>)
            .await
            .context("Failed to join channel")?;

        // Refresh channel details after joining
        if let Ok(details) = self.get_channel_details(channel_id).await {
            let mut state = self.state.write().await;
            state.channel_members.insert(channel_id.to_string(), details.members);
        }

        Ok(())
    }

    /// Leave a channel
    pub async fn leave_channel(&self, grid_id: &str, channel_id: &str) -> Result<()> {
        let endpoint = format!("/api/v1/grids/{}/channels/{}/leave", grid_id, channel_id);
        let _: serde_json::Value = self
            .api_client
            .post(&endpoint, None::<&()>)
            .await
            .context("Failed to leave channel")?;

        // Remove from local state
        let mut state = self.state.write().await;
        state.channel_members.remove(channel_id);
        state.messages.remove(channel_id);
        state.typing_indicators.remove(channel_id);

        Ok(())
    }

    // ===== MESSAGE OPERATIONS =====

    /// Send a message to a channel
    pub async fn send_message(
        &self,
        channel_id: &str,
        request: SendMessageRequest,
    ) -> Result<TextMessage> {
        let endpoint = format!("/api/v1/channels/{}/messages", channel_id);
        let response: SendMessageResponse = self
            .api_client
            .post(&endpoint, Some(&request))
            .await
            .context("Failed to send message")?;

        // Update local state
        let mut state = self.state.write().await;
        let channel_messages = state.messages.entry(channel_id.to_string()).or_insert_with(Vec::new);
        channel_messages.push(response.message.clone());

        // Keep only the last 100 messages in memory
        if channel_messages.len() > 100 {
            channel_messages.remove(0);
        }

        Ok(response.message)
    }

    /// Get messages from a channel with pagination
    pub async fn get_channel_messages(
        &self,
        channel_id: &str,
        request: GetMessagesRequest,
    ) -> Result<GetMessagesResponse> {
        let endpoint = format!("/api/v1/channels/{}/messages", channel_id);
        
        // Build query parameters
        let mut query_params = Vec::new();
        if let Some(limit) = request.limit {
            query_params.push(format!("limit={}", limit));
        }
        if let Some(before) = &request.before {
            query_params.push(format!("before={}", before));
        }
        if let Some(after) = &request.after {
            query_params.push(format!("after={}", after));
        }

        let endpoint_with_params = if query_params.is_empty() {
            endpoint
        } else {
            format!("{}?{}", endpoint, query_params.join("&"))
        };

        let response: GetMessagesResponse = self
            .api_client
            .get(&endpoint_with_params)
            .await
            .context("Failed to get channel messages")?;

        // Update local state
        let mut state = self.state.write().await;
        
        // Update messages (merge with existing or replace)
        if request.before.is_none() && request.after.is_none() {
            // Fresh load - replace all messages
            state.messages.insert(channel_id.to_string(), response.messages.clone());
        } else {
            // Pagination - merge messages
            let channel_messages = state.messages.entry(channel_id.to_string()).or_insert_with(Vec::new);
            
            for new_message in &response.messages {
                if !channel_messages.iter().any(|m| m.id == new_message.id) {
                    channel_messages.push(new_message.clone());
                }
            }
            
            // Sort by created_at
            channel_messages.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        }

        // Update pagination cursor
        state.pagination_cursors.insert(
            channel_id.to_string(),
            MessagePaginationCursor {
                oldest_message_id: response.oldest_id.clone(),
                newest_message_id: response.newest_id.clone(),
                has_more_older: response.has_more,
                has_more_newer: false, // Assuming we're loading older messages
                total_count: response.total_count,
            },
        );

        Ok(response)
    }

    /// Edit a message
    pub async fn edit_message(
        &self,
        message_id: &str,
        request: EditMessageRequest,
    ) -> Result<TextMessage> {
        let endpoint = format!("/api/v1/messages/{}", message_id);
        let response: serde_json::Value = self
            .api_client
            .put(&endpoint, Some(&request))
            .await
            .context("Failed to edit message")?;

        let message: TextMessage = serde_json::from_value(
            response["message"].clone()
        ).context("Failed to parse edited message")?;

        // Update local state
        let mut state = self.state.write().await;
        for channel_messages in state.messages.values_mut() {
            if let Some(msg) = channel_messages.iter_mut().find(|m| m.id == message_id) {
                *msg = message.clone();
                break;
            }
        }

        Ok(message)
    }

    /// Delete a message
    pub async fn delete_message(
        &self,
        message_id: &str,
        request: Option<DeleteMessageRequest>,
    ) -> Result<()> {
        let endpoint = format!("/api/v1/messages/{}", message_id);
        let _: serde_json::Value = self
            .api_client
            .delete_with_body(&endpoint, request.as_ref())
            .await
            .context("Failed to delete message")?;

        // Mark message as deleted in local state
        let mut state = self.state.write().await;
        for channel_messages in state.messages.values_mut() {
            if let Some(msg) = channel_messages.iter_mut().find(|m| m.id == message_id) {
                msg.is_deleted = true;
                msg.deleted_at = Some(chrono::Utc::now().to_rfc3339());
                break;
            }
        }

        Ok(())
    }

    // ===== REACTIONS =====

    /// Add a reaction to a message
    pub async fn add_reaction(
        &self,
        message_id: &str,
        request: AddReactionRequest,
    ) -> Result<MessageReaction> {
        let endpoint = format!("/api/v1/messages/{}/reactions", message_id);
        let response: serde_json::Value = self
            .api_client
            .post(&endpoint, Some(&request))
            .await
            .context("Failed to add reaction")?;

        let reaction: MessageReaction = serde_json::from_value(
            response["reaction"].clone()
        ).context("Failed to parse reaction")?;

        // Update local state
        let mut state = self.state.write().await;
        let message_reactions = state.message_reactions.entry(message_id.to_string()).or_insert_with(Vec::new);
        message_reactions.push(reaction.clone());

        Ok(reaction)
    }

    /// Remove a reaction from a message
    pub async fn remove_reaction(
        &self,
        message_id: &str,
        request: RemoveReactionRequest,
    ) -> Result<()> {
        let endpoint = format!("/api/v1/messages/{}/reactions", message_id);
        let _: serde_json::Value = self
            .api_client
            .delete_with_body(&endpoint, Some(&request))
            .await
            .context("Failed to remove reaction")?;

        // Remove from local state
        let mut state = self.state.write().await;
        if let Some(reactions) = state.message_reactions.get_mut(message_id) {
            reactions.retain(|r| r.emoji != request.emoji);
        }

        Ok(())
    }

    // ===== TYPING INDICATORS =====

    /// Set typing indicator for a channel
    pub async fn set_typing_indicator(
        &self,
        channel_id: &str,
        is_typing: bool,
    ) -> Result<()> {
        let endpoint = format!("/api/v1/channels/{}/typing", channel_id);
        let request = SetTypingIndicatorRequest { is_typing };
        
        let _: serde_json::Value = self
            .api_client
            .post(&endpoint, Some(&request))
            .await
            .context("Failed to set typing indicator")?;

        Ok(())
    }

    // ===== WEBSOCKET MESSAGE HANDLING =====

    /// Handle incoming WebSocket messages for messaging
    pub async fn handle_websocket_message(&self, message_type: &str, payload: serde_json::Value) -> Result<()> {
        match message_type {
            "text_message_received" | "system_message_received" => {
                if let Ok(msg_payload) = serde_json::from_value::<TextMessagePayload>(payload) {
                    self.handle_message_received(msg_payload).await?;
                }
            }
            "text_message_edited" => {
                if let Ok(edit_payload) = serde_json::from_value::<MessageEditedPayload>(payload) {
                    self.handle_message_edited(edit_payload).await?;
                }
            }
            "text_message_deleted" => {
                if let Ok(delete_payload) = serde_json::from_value::<MessageDeletedPayload>(payload) {
                    self.handle_message_deleted(delete_payload).await?;
                }
            }
            "message_reaction_changed" => {
                if let Ok(reaction_payload) = serde_json::from_value::<MessageReactionPayload>(payload) {
                    self.handle_reaction_changed(reaction_payload).await?;
                }
            }
            "typing_indicator" => {
                if let Ok(typing_payload) = serde_json::from_value::<TypingIndicatorPayload>(payload) {
                    self.handle_typing_indicator(typing_payload).await?;
                }
            }
            _ => {
                // Unknown message type - ignore
            }
        }

        Ok(())
    }

    async fn handle_message_received(&self, payload: TextMessagePayload) -> Result<()> {
        let mut state = self.state.write().await;
        let channel_messages = state.messages.entry(payload.channel_id.clone()).or_insert_with(Vec::new);
        
        // Check if message already exists (avoid duplicates)
        if !channel_messages.iter().any(|m| m.id == payload.message.id) {
            channel_messages.push(payload.message);
            
            // Keep only the last 100 messages in memory
            if channel_messages.len() > 100 {
                channel_messages.remove(0);
            }
        }

        Ok(())
    }

    async fn handle_message_edited(&self, payload: MessageEditedPayload) -> Result<()> {
        let mut state = self.state.write().await;
        if let Some(channel_messages) = state.messages.get_mut(&payload.channel_id) {
            if let Some(msg) = channel_messages.iter_mut().find(|m| m.id == payload.message.id) {
                *msg = payload.message;
            }
        }

        Ok(())
    }

    async fn handle_message_deleted(&self, payload: MessageDeletedPayload) -> Result<()> {
        let mut state = self.state.write().await;
        if let Some(channel_messages) = state.messages.get_mut(&payload.channel_id) {
            if let Some(msg) = channel_messages.iter_mut().find(|m| m.id == payload.message_id) {
                msg.is_deleted = true;
                msg.deleted_at = Some(chrono::Utc::now().to_rfc3339());
            }
        }

        Ok(())
    }

    async fn handle_reaction_changed(&self, payload: MessageReactionPayload) -> Result<()> {
        let mut state = self.state.write().await;
        let reactions = state.message_reactions.entry(payload.message_id.clone()).or_insert_with(Vec::new);
        
        match payload.action.as_str() {
            "added" => {
                // Add reaction if not already present
                if !reactions.iter().any(|r| r.id == payload.reaction.id) {
                    reactions.push(payload.reaction);
                }
            }
            "removed" => {
                // Remove reaction
                reactions.retain(|r| r.id != payload.reaction.id);
            }
            _ => {}
        }

        Ok(())
    }

    async fn handle_typing_indicator(&self, payload: TypingIndicatorPayload) -> Result<()> {
        let mut state = self.state.write().await;
        let typing_indicators = state.typing_indicators.entry(payload.channel_id.clone()).or_insert_with(Vec::new);
        
        if payload.is_typing {
            // Add or update typing indicator
            let indicator = TypingIndicator {
                channel_id: payload.channel_id,
                user_id: payload.user_id.clone(),
                is_typing: true,
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            
            // Remove existing indicator for this user, then add new one
            typing_indicators.retain(|t| t.user_id != payload.user_id);
            typing_indicators.push(indicator);
        } else {
            // Remove typing indicator
            typing_indicators.retain(|t| t.user_id != payload.user_id);
        }

        Ok(())
    }

    // ===== STATE ACCESS =====

    /// Get current messaging state (for frontend)
    pub async fn get_state(&self) -> MessagingState {
        self.state.read().await.clone()
    }

    /// Get messages for a specific channel from local state
    pub async fn get_cached_messages(&self, channel_id: &str) -> Vec<TextMessage> {
        let state = self.state.read().await;
        state.messages.get(channel_id).cloned().unwrap_or_default()
    }

    /// Get channels for a specific grid from local state
    pub async fn get_cached_channels(&self, grid_id: &str) -> Vec<ChannelInfo> {
        let state = self.state.read().await;
        state.channels.get(grid_id).cloned().unwrap_or_default()
    }

    /// Clear local state for a grid (when leaving grid)
    pub async fn clear_grid_state(&self, grid_id: &str) {
        let mut state = self.state.write().await;
        
        // Remove all channels for this grid
        if let Some(channels) = state.channels.remove(grid_id) {
            // Remove messages and other data for all channels in this grid
            for channel in channels {
                state.messages.remove(&channel.id);
                state.channel_members.remove(&channel.id);
                state.typing_indicators.remove(&channel.id);
                state.pagination_cursors.remove(&channel.id);
            }
        }

        state.last_updated.remove(grid_id);
    }

    /// Create a new voice channel in a grid
    pub async fn create_voice_channel(
        &self,
        grid_id: &str,
        request: CreateVoiceChannelRequest,
    ) -> Result<ChannelInfo> {
        let endpoint = format!("/api/v1/grids/{}/channels/voice", grid_id);
        
        log::info!("Making voice channel request to: {}", endpoint);
        log::info!("Request payload: {:?}", request);
        
        // Serialize the request to see what's being sent
        match serde_json::to_string(&request) {
            Ok(json_str) => log::info!("JSON payload: {}", json_str),
            Err(e) => log::error!("Failed to serialize request: {}", e),
        }
        
        let response = self
            .api_client
            .post(&endpoint, Some(&request))
            .await;
            
        match &response {
            Ok(resp) => {
                log::info!("Received successful response from API");
                log::info!("Response content: {:?}", resp);
            },
            Err(e) => {
                log::error!("HTTP request failed with error: {:?}", e);
                log::error!("Error details: {}", e);
            }
        }
        
        let response: serde_json::Value = response
            .context("Failed to create voice channel")?;

        log::info!("Parsed response as JSON: {:?}", response);

        // Check if the response has the expected structure
        if !response.is_object() {
            log::error!("Response is not a JSON object: {:?}", response);
            return Err(anyhow::anyhow!("Invalid response format: expected JSON object"));
        }

        if !response.get("channel").is_some() {
            log::error!("Response missing 'channel' field. Available fields: {:?}", response.as_object().map(|obj| obj.keys().collect::<Vec<_>>()));
            return Err(anyhow::anyhow!("Response missing 'channel' field"));
        }

        log::info!("Attempting to parse channel from response...");
        let channel: ChannelInfo = serde_json::from_value(
            response["channel"].clone()
        ).context("Failed to parse voice channel response")?;

        log::info!("Successfully parsed channel: {:?}", channel);

        // Update local state
        let mut state = self.state.write().await;
        let grid_channels = state.channels.entry(grid_id.to_string()).or_insert_with(Vec::new);
        grid_channels.retain(|c| c.id != channel.id);
        grid_channels.push(channel.clone());

        log::info!("Voice channel creation completed successfully");
        Ok(channel)
    }
}
