use regex::Regex;
use std::collections::HashMap;

// Code validation utilities
pub struct CodeValidator;

impl CodeValidator {
    /// Validates if a code follows the XXX-XXX format
    pub fn validate_format(code: &str) -> bool {
        let code_regex = Regex::new(r"^[A-Z0-9]{3}-[A-Z0-9]{3}$").unwrap();
        code_regex.is_match(code)
    }

    /// Auto-formats input to XXX-XXX format
    pub fn format_code(input: &str) -> String {
        let cleaned = input
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>()
            .to_uppercase();
            
        if cleaned.len() <= 3 {
            return cleaned;
        }
        
        let first_part = &cleaned[..3];
        let second_part = &cleaned[3..6.min(cleaned.len())];
        format!("{}-{}", first_part, second_part)
    }

    /// Checks if a code is potentially expired
    pub fn is_expired(expires_at: &Option<String>) -> bool {
        if let Some(expiry_str) = expires_at {
            if let Ok(expiry_time) = chrono::DateTime::parse_from_rfc3339(expiry_str) {
                return expiry_time < chrono::Utc::now();
            }
        }
        false
    }

    /// Checks if a code has reached its usage limit
    pub fn is_usage_exhausted(used_count: i32, usage_limit: i32) -> bool {
        usage_limit > 0 && used_count >= usage_limit
    }

    /// Validates code name (optional field)
    pub fn validate_code_name(name: &str) -> Result<(), String> {
        if name.is_empty() {
            return Err("Code name cannot be empty".to_string());
        }
        
        if name.len() > 50 {
            return Err("Code name cannot exceed 50 characters".to_string());
        }
        
        // Check for invalid characters
        let invalid_chars = name.chars().any(|c| !c.is_alphanumeric() && !c.is_whitespace() && c != '-' && c != '_');
        if invalid_chars {
            return Err("Code name contains invalid characters".to_string());
        }
        
        Ok(())
    }
}

// Permission utilities for resource codes
pub struct PermissionHelper;

impl PermissionHelper {
    /// Creates default process permissions
    pub fn default_process_permissions() -> serde_json::Value {
        serde_json::json!({
            "can_view": true,
            "can_connect": false,
            "can_send_commands": false,
            "can_restart": false,
            "can_view_logs": true
        })
    }

    /// Creates default grid invite permissions
    pub fn default_invite_permissions() -> serde_json::Value {
        serde_json::json!({
            "role": "member",
            "auto_approve": false,
            "skip_onboarding": false
        })
    }

    /// Creates default channel permissions
    pub fn default_channel_permissions() -> serde_json::Value {
        serde_json::json!({
            "can_join": true,
            "can_speak": false,
            "can_moderate": false,
            "can_screen_share": false,
            "can_record": false
        })
    }

    /// Merges user-provided permissions with defaults
    pub fn merge_permissions(defaults: serde_json::Value, overrides: Option<serde_json::Value>) -> serde_json::Value {
    if let Some(overrides_obj) = overrides {
        if let (serde_json::Value::Object(mut default_map), serde_json::Value::Object(override_map)) = (defaults.clone(), overrides_obj) {
                for (key, value) in override_map {
                    default_map.insert(key, value);
                }
                return serde_json::Value::Object(default_map);
            }
        }
        defaults
    }
}

// URL and sharing utilities
pub struct SharingHelper;

impl SharingHelper {
    /// Creates a shareable URL for a code
    pub fn create_shareable_url(grid_id: &str, access_code: &str) -> String {
        format!("https://roguegrid9.com/join?grid={}&code={}", grid_id, access_code)
    }

    /// Creates a deep link for mobile apps
    pub fn create_deep_link(grid_id: &str, access_code: &str) -> String {
        format!("roguegrid9://join?grid={}&code={}", grid_id, access_code)
    }

    /// Extracts grid ID and code from a shareable URL
    pub fn parse_shareable_url(url: &str) -> Option<(String, String)> {
        let url_regex = Regex::new(r"grid=([^&]+)&code=([^&]+)").ok()?;
        let captures = url_regex.captures(url)?;
        
        let grid_id = captures.get(1)?.as_str().to_string();
        let code = captures.get(2)?.as_str().to_string();
        
        Some((grid_id, code))
    }

    /// Generates a QR code data URL for sharing
    pub fn generate_qr_data(content: &str) -> String {
        format!("data:image/svg+xml;base64,{}", base64::encode(content))
    }
}

// Code analytics and statistics
pub struct CodeAnalytics;

impl CodeAnalytics {
    /// Calculates usage statistics for a set of codes
    pub fn calculate_usage_stats(codes: &[crate::api::types::ResourceAccessCode]) -> HashMap<String, i32> {
        let mut stats = HashMap::new();
        
        stats.insert("total_codes".to_string(), codes.len() as i32);
        stats.insert("active_codes".to_string(), codes.iter().filter(|c| c.is_active).count() as i32);
        stats.insert("expired_codes".to_string(), codes.iter().filter(|c| CodeValidator::is_expired(&c.expires_at)).count() as i32);
        stats.insert("usage_exhausted".to_string(), codes.iter().filter(|c| CodeValidator::is_usage_exhausted(c.used_count, c.usage_limit)).count() as i32);
        stats.insert("total_usage".to_string(), codes.iter().map(|c| c.used_count).sum());
        
        stats
    }

    /// Gets the most popular resource types
    pub fn popular_resource_types(codes: &[crate::api::types::ResourceAccessCode]) -> HashMap<String, i32> {
        let mut counts = HashMap::new();
        
        for code in codes {
            let type_str = format!("{:?}", code.resource_type);
            *counts.entry(type_str).or_insert(0) += 1;
        }
        
        counts
    }

    /// Finds codes that might need attention (expiring soon, high usage)
    pub fn codes_needing_attention(codes: &[crate::api::types::ResourceAccessCode]) -> Vec<String> {
        let mut attention_codes = Vec::new();
        let now = chrono::Utc::now();
        
        for code in codes {
            // Check if expiring within 1 hour
            if let Some(expires_at) = &code.expires_at {
                if let Ok(expiry_time) = chrono::DateTime::parse_from_rfc3339(expires_at) {
                    let time_until_expiry = expiry_time.signed_duration_since(now);
                    if time_until_expiry.num_hours() <= 1 && time_until_expiry.num_seconds() > 0 {
                        attention_codes.push(format!("Code {} expires in {} minutes", 
                                                   code.access_code, time_until_expiry.num_minutes()));
                    }
                }
            }
            
            // Check if near usage limit
            if code.usage_limit > 0 {
                let usage_percentage = (code.used_count as f64 / code.usage_limit as f64) * 100.0;
                if usage_percentage >= 80.0 {
                    attention_codes.push(format!("Code {} has used {}% of its limit", 
                                               code.access_code, usage_percentage as i32));
                }
            }
        }
        
        attention_codes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_validation() {
        assert!(CodeValidator::validate_format("ABC-123"));
        assert!(CodeValidator::validate_format("XYZ-789"));
        assert!(!CodeValidator::validate_format("ABC123"));
        assert!(!CodeValidator::validate_format("AB-123"));
        assert!(!CodeValidator::validate_format("ABC-12"));
    }

    #[test]
    fn test_code_formatting() {
        assert_eq!(CodeValidator::format_code("abc123"), "ABC-123");
        assert_eq!(CodeValidator::format_code("ABC123"), "ABC-123");
        assert_eq!(CodeValidator::format_code("a-b-c-1-2-3"), "ABC-123");
        assert_eq!(CodeValidator::format_code("ab"), "AB");
    }

    #[test]
    fn test_url_parsing() {
        let url = "https://roguegrid9.com/join?grid=test-grid&code=ABC-123";
        let result = SharingHelper::parse_shareable_url(url);
        assert_eq!(result, Some(("test-grid".to_string(), "ABC-123".to_string())));
    }
}
