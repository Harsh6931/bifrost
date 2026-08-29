use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
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
    headers: HeaderMap,
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

    // 1. Resolve prompt from the last user message
    let prompt = req
        .messages
        .last()
        .map(|m| match &m.content {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        })
        .unwrap_or_default();

    // 2. Resolve Bifrost policy settings from request headers
    let mode = headers
        .get("x-bifrost-mode")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("balanced")
        .to_string();

    let lambda_val: f64 = headers
        .get("x-bifrost-lambda")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.5);

    // Default candidates list matching models_registry.json
    let candidates = vec![
        "openai/gpt-5.5".to_string(),
        "anthropic/claude-sonnet-4.6".to_string(),
        "google/gemini-2.5-pro".to_string(),
        "deepseek/deepseek-r1".to_string(),
        "openai/gpt-5-mini".to_string(),
        "qwen/qwen3.7-flash".to_string(),
    ];

    // 3. Make request to Python ML Router to choose the optimal candidate
    let route_payload = json!({
        "prompt": prompt,
        "candidates": candidates,
        "policy": {
            "mode": mode,
            "lambda": lambda_val,
            "max_cost_usd": 0.05
        }
    });

    let chosen_model = match state
        .http
        .post(format!("{}/route", state.ml_router_url))
        .json(&route_payload)
        .send()
        .await
    {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(res_body) = res.json::<serde_json::Value>().await {
                    res_body
                        .get("chosen")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| state.default_model.clone())
                } else {
                    state.default_model.clone()
                }
            } else {
                tracing::warn!("ML Router returned error status: {}. Failing open to default model.", res.status());
                state.default_model.clone()
            }
        }
        Err(err) => {
            tracing::warn!("Failed to communicate with ML Router: {}. Failing open to default model.", err);
            state.default_model.clone()
        }
    };

    tracing::info!(%chosen_model, "routed request");

    req.model = Some(chosen_model);
    req.stream = false;

    let (status, body) = state.openrouter.chat(&req).await?;
    Ok((status, Json(body)).into_response())
}

pub async fn route_preview(
    State(state): State<AppState>,
    _auth: RequireApiKey,
    Json(payload): Json<serde_json::Value>,
) -> Result<Response, GatewayError> {
    // Forward the route preview request directly to the Python ML Router
    let res = state
        .http
        .post(format!("{}/route", state.ml_router_url))
        .json(&payload)
        .send()
        .await?;

    let status = res.status();
    let body: serde_json::Value = res.json().await?;
    Ok((status, Json(body)).into_response())
}
