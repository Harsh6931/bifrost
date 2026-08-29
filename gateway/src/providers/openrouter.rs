use axum::http::StatusCode;
use serde_json::Value;

use crate::error::GatewayError;
use crate::openai::ChatCompletionRequest;
use crate::providers::LlmProvider;

const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

#[derive(Clone)]
pub struct OpenRouter {
    client: reqwest::Client,
    api_key: String,
}

impl OpenRouter {
    pub fn new(client: reqwest::Client, api_key: String) -> Self {
        Self { client, api_key }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && !self.api_key.contains("xxxxxxxx")
    }

    pub async fn send(
        &self,
        req: &ChatCompletionRequest,
    ) -> Result<reqwest::Response, GatewayError> {
        Ok(self
            .client
            .post(OPENROUTER_CHAT_URL)
            .bearer_auth(&self.api_key)
            .header("HTTP-Referer", "http://localhost:8080")
            .header("X-Title", "Bifrost")
            .json(req)
            .send()
            .await?)
    }
}

impl LlmProvider for OpenRouter {
    async fn chat(&self, req: &ChatCompletionRequest) -> Result<(StatusCode, Value), GatewayError> {
        let response = self.send(req).await?;
        let status =
            StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let body = response.json::<Value>().await.map_err(|err| {
            GatewayError::Upstream(format!("openrouter returned non-json: {err}"))
        })?;
        Ok((status, body))
    }
}
