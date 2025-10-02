use anyhow::{Result, Context, bail};
use serde::{Deserialize, Serialize};

// Supabase configuration - these are public/anon keys, safe to embed
const SUPABASE_URL: &str = "https://pepsufkvgfwymtmrjkna.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcHN1Zmt2Z2Z3eW10bXJqa25hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzkwNTgsImV4cCI6MjA3MDg1NTA1OH0.3qxsJ0KNZQei9gBitcyIGsKggkKyGYxNttqMfsqHkHM";
#[derive(Debug, Serialize, Deserialize)]
pub struct SupabaseUser {
    pub id: String,
    pub email: String,
    pub email_confirmed_at: Option<String>,
    pub phone: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_sign_in_at: Option<String>,
    pub app_metadata: serde_json::Value,
    pub user_metadata: serde_json::Value,
    pub identities: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupabaseSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub expires_at: u64,
    pub token_type: String,
    pub user: SupabaseUser,
}

pub struct SupabaseClient {
    base_url: String,
    anon_key: String,
    http_client: reqwest::Client,
}

impl SupabaseClient {
    pub fn new() -> Self {
        Self {
            base_url: SUPABASE_URL.to_string(),
            anon_key: SUPABASE_ANON_KEY.to_string(),
            http_client: reqwest::Client::new(),
        }
    }

    /// Verify a Supabase JWT token and extract user information
    pub async fn verify_token(&self, token: &str) -> Result<SupabaseUser> {
        log::info!("Verifying Supabase token");
        
        // For now, we'll verify the token by calling the Supabase API directly
        // This validates the token and gets user info in one call
        let user = self.get_user_from_api(token).await
            .context("Failed to verify token with Supabase API")?;

        log::info!("Supabase token verified successfully for user: {}", user.email);
        Ok(user)
    }

    /// Call Supabase API to get user info (this validates the token)
    async fn get_user_from_api(&self, token: &str) -> Result<SupabaseUser> {
        let url = format!("{}/auth/v1/user", self.base_url);
        
        let response = self.http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("apikey", &self.anon_key)
            .send()
            .await
            .context("Failed to call Supabase user API")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            bail!("Supabase API error {}: {}", status, body);
        }

        let user: SupabaseUser = response.json().await
            .context("Failed to parse Supabase user response")?;

        Ok(user)
    }

    /// Extract user display name from Supabase user data
    pub fn extract_display_name(&self, user: &SupabaseUser) -> String {
        // For authenticated users, use full email as display name
        // This makes them searchable by email and removes username complexity
        user.email.clone()
    }

    /// Extract provider info for our database
    pub fn extract_provider_info(&self, user: &SupabaseUser) -> (String, String) {
        // Check identities for the provider
        if let Some(identity) = user.identities.first() {
            if let (Some(provider), Some(provider_id)) = (
                identity.get("provider").and_then(|v| v.as_str()),
                identity.get("id").and_then(|v| v.as_str())
            ) {
                return (provider.to_string(), provider_id.to_string());
            }
        }

        // Fallback to email provider
        ("email".to_string(), user.id.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_display_name() {
        let client = SupabaseClient::new();
        
        let mut user = SupabaseUser {
            id: "test-123".to_string(),
            email: "test@example.com".to_string(),
            email_confirmed_at: None,
            phone: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            last_sign_in_at: None,
            app_metadata: serde_json::json!({}),
            user_metadata: serde_json::json!({"name": "Test User"}),
            identities: vec![],
        };

        assert_eq!(client.extract_display_name(&user), "Test User");

        // Test email fallback
        user.user_metadata = serde_json::json!({});
        assert_eq!(client.extract_display_name(&user), "test");
    }
}