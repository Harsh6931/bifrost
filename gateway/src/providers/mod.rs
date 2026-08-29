pub mod openrouter;

use axum::http::StatusCode;
use serde_json::Value;

use crate::error::GatewayError;
use crate::openai::ChatCompletionRequest;

/// One method: send a chat request, get status + JSON back.
/// OpenRouter is the only impl for now. A direct OpenAI/Anthropic
/// client could implement this later without touching the handler.
pub trait LlmProvider: Send + Sync {
    fn chat(
        &self,
        req: &ChatCompletionRequest,
    ) -> impl std::future::Future<Output = Result<(StatusCode, Value), GatewayError>> + Send;
}
