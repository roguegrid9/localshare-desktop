// HTTP proxy - forwards tunnel requests to local process

use super::{HttpRequestPayload, HttpResponsePayload};
use anyhow::{Context, Result};
use log::{error, info};
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;

/// HTTP proxy that forwards requests to local process
pub struct HttpProxy {
    local_port: u16,
    client: Client,
}

impl HttpProxy {
    /// Create a new HTTP proxy
    pub fn new(local_port: u16) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self { local_port, client })
    }

    /// Forward HTTP request to local process and return response
    pub async fn forward_request(&self, request: HttpRequestPayload) -> HttpResponsePayload {
        match self.forward_request_internal(request).await {
            Ok(response) => response,
            Err(e) => {
                error!("Failed to forward request: {}", e);

                // Return error response
                HttpResponsePayload {
                    status_code: 502,
                    headers: {
                        let mut headers = HashMap::new();
                        headers.insert("Content-Type".to_string(), "text/plain".to_string());
                        headers
                    },
                    body: Some(format!("Failed to reach local process: {}", e).into_bytes()),
                }
            }
        }
    }

    async fn forward_request_internal(
        &self,
        request: HttpRequestPayload,
    ) -> Result<HttpResponsePayload> {
        // Build URL
        let url = format!("http://localhost:{}{}", self.local_port, request.path);

        info!("Forwarding {} request to {}", request.method, url);

        // Build request
        let method = reqwest::Method::from_bytes(request.method.as_bytes())
            .context("Invalid HTTP method")?;

        let mut req_builder = self.client.request(method, &url);

        // Add headers
        for (key, value) in request.headers {
            req_builder = req_builder.header(&key, &value);
        }

        // Add body if present
        if let Some(body) = request.body {
            req_builder = req_builder.body(body);
        }

        // Send request
        let response = req_builder
            .send()
            .await
            .context("Failed to send request to local process")?;

        // Extract response data
        let status_code = response.status().as_u16();

        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(key.to_string(), value_str.to_string());
            }
        }

        let body = Some(
            response
                .bytes()
                .await
                .context("Failed to read response body")?
                .to_vec(),
        );

        info!("Received response with status {}", status_code);

        Ok(HttpResponsePayload {
            status_code,
            headers,
            body,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_proxy_creation() {
        let proxy = HttpProxy::new(8080);
        assert!(proxy.is_ok());
    }
}
