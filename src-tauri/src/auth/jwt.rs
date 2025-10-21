use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub iss: String,                    // issuer
    pub sub: String,                    // subject (user_id)
    pub aud: Option<String>,            // FIX: Optional audience (developer_id)
    pub dev_handle: Option<String>,     // FIX: Optional developer_user_handle  
    pub account_type: Option<String>,   // FIX: Add account_type field
    pub exp: u64,                       // expiration time
    pub iat: u64,                       // issued at
    pub nbf: Option<u64>,              // FIX: Optional not before
    #[serde(rename = "type")]
    pub token_type: String,             // "provisional" or "anonymous"
}

pub fn parse_jwt_claims(token: &str) -> Result<JwtClaims> {
    // For now, we'll decode without verifying the signature
    // In production, you'd want to verify with the server's public key
    let mut validation = Validation::new(Algorithm::HS256);
    validation.insecure_disable_signature_validation();
    validation.validate_exp = false; // We'll handle expiration manually
    validation.validate_nbf = false; // Make nbf optional
    
    // Use a dummy key since we're not validating signature
    let dummy_key = DecodingKey::from_secret(b"dummy");
    
    let token_data = decode::<JwtClaims>(token, &dummy_key, &validation)
        .context("Failed to decode JWT token")?;
    
    log::info!("JWT decoded successfully");
    log::info!("Token type: {}", token_data.claims.token_type);
    log::info!("Issuer: {}", token_data.claims.iss);
    log::info!("Account type: {:?}", token_data.claims.account_type);
    log::info!("Developer handle: {:?}", token_data.claims.dev_handle);
    
    Ok(token_data.claims)
}

pub fn extract_user_id_from_token(token: &str) -> Result<String> {
    let claims = parse_jwt_claims(token)?;
    Ok(claims.sub)
}

pub fn extract_display_name_from_token(token: &str) -> Result<String> {
    let claims = parse_jwt_claims(token)?;
    // For anonymous accounts, dev_handle might be None
    Ok(claims.dev_handle.unwrap_or_else(|| format!("User {}", &claims.sub[..8])))
}

pub fn is_provisional_token(token: &str) -> Result<bool> {
    let claims = parse_jwt_claims(token)?;
    Ok(claims.token_type == "provisional")
}

pub fn is_anonymous_token(token: &str) -> Result<bool> {
    let claims = parse_jwt_claims(token)?;
    Ok(claims.account_type.as_deref() == Some("anonymous"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    // Helper function to create a test JWT token
    fn create_test_token(
        user_id: &str,
        token_type: &str,
        dev_handle: Option<String>,
        account_type: Option<String>,
    ) -> String {
        let claims = JwtClaims {
            iss: "test-issuer".to_string(),
            sub: user_id.to_string(),
            aud: Some("test-audience".to_string()),
            dev_handle,
            account_type,
            exp: 9999999999, // Far future
            iat: 1000000000,
            nbf: Some(1000000000),
            token_type: token_type.to_string(),
        };

        let key = EncodingKey::from_secret(b"test-secret");
        encode(&Header::default(), &claims, &key).unwrap()
    }

    #[test]
    fn test_extract_user_id_from_token() {
        let token = create_test_token(
            "user-12345",
            "provisional",
            Some("testuser".to_string()),
            None,
        );

        let result = extract_user_id_from_token(&token);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "user-12345");
    }

    #[test]
    fn test_extract_display_name_with_dev_handle() {
        let token = create_test_token(
            "user-12345",
            "provisional",
            Some("john_doe".to_string()),
            None,
        );

        let result = extract_display_name_from_token(&token);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "john_doe");
    }

    #[test]
    fn test_extract_display_name_without_dev_handle() {
        let token = create_test_token(
            "user-abcd1234",
            "anonymous",
            None,
            Some("anonymous".to_string()),
        );

        let result = extract_display_name_from_token(&token);
        assert!(result.is_ok());
        let display_name = result.unwrap();
        // Should fallback to "User {first 8 chars of user_id}"
        assert_eq!(display_name, "User user-abc");
    }

    #[test]
    fn test_is_provisional_token_returns_true() {
        let token = create_test_token(
            "user-12345",
            "provisional",
            Some("testuser".to_string()),
            None,
        );

        let result = is_provisional_token(&token);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);
    }

    #[test]
    fn test_is_anonymous_token_returns_true() {
        let token = create_test_token(
            "user-12345",
            "anonymous",
            None,
            Some("anonymous".to_string()),
        );

        let result = is_anonymous_token(&token);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);
    }
}