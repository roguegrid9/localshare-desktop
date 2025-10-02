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