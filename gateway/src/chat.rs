use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::auth::RequireApiKey;
use crate::error::GatewayError;
use crate::openai::ChatCompletionRequest;
use crate::providers::LlmProvider;
use crate::AppState;

pub async fn chat_completions(
    State(state): State<AppState>,
    _auth: RequireApiKey,
    Json(mut req): Json<ChatCompletionRequest>,
) -> Result<Response, GatewayError> {
    if req.messages.is_empty() {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": {
                    "message": "messages must not be empty",
                    "type": "invalid_request_error"
                }
            })),
        )
            .into_response());
    }

    if req.stream {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": {
                    "message": "streaming is not supported yet; set stream=false",
                    "type": "invalid_request_error"
                }
            })),
        )
            .into_response());
    }

    if !state.openrouter.is_configured() {
        return Ok((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": {
                    "message": "OPENROUTER_API_KEY is not set in .env",
                    "type": "api_error"
                }
            })),
        )
            .into_response());
    }

    // ML routing is next. For now every prompt uses DEFAULT_MODEL.
    req.model = Some(state.default_model.clone());
    req.stream = false;

    let (status, body) = state.openrouter.chat(&req).await?;
    Ok((status, Json(body)).into_response())
}
