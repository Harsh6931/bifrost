use std::time::Instant;

use axum::body::Body;
use axum::extract::State;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use bytes::Bytes;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::auth::RequireApiKey;
use crate::error::GatewayError;
use crate::openai::{
    completion_to_sse, prompt_policy_hash, prompt_preview, reconstruct_from_sse,
    ChatCompletionRequest,
};
use crate::providers::LlmProvider;
use crate::telemetry::{self, Outcome};
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

    let want_stream = req.stream;
    let mode = headers
        .get("x-bifrost-mode")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("balanced")
        .to_string();
    let lambda: f64 = headers
        .get("x-bifrost-lambda")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.5);
    let hash = prompt_policy_hash(&req.messages, &mode, lambda);
    let preview = prompt_preview(&req.messages);
    let started = Instant::now();

    req.model = Some(state.default_model.clone());

    if let Some(cached) = state.cache.get(&hash).await {
        let chosen = cached
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&state.default_model)
            .to_string();
        telemetry::record(
            &state,
            hash,
            preview,
            mode,
            lambda as f32,
            Outcome {
                chosen_model: chosen,
                body: cached.clone(),
                cache_hit: true,
                latency_ms: started.elapsed().as_millis() as i32,
            },
        )
        .await;
        return Ok(respond_cached(want_stream, cached));
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

    if want_stream {
        return proxy_stream(state, req, hash, preview, mode, lambda, started).await;
    }

    req.stream = false;
    let (status, body) = state.openrouter.chat(&req).await?;
    if status.is_success() {
        let chosen = body
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&state.default_model)
            .to_string();
        telemetry::record(
            &state,
            hash,
            preview,
            mode,
            lambda as f32,
            Outcome {
                chosen_model: chosen,
                body: body.clone(),
                cache_hit: false,
                latency_ms: started.elapsed().as_millis() as i32,
            },
        )
        .await;
    }
    Ok((status, Json(body)).into_response())
}

fn respond_cached(want_stream: bool, body: Value) -> Response {
    if want_stream {
        let sse = completion_to_sse(&body);
        Response::builder()
            .status(StatusCode::OK)
            .header(CONTENT_TYPE, "text/event-stream")
            .header(CACHE_CONTROL, "no-cache")
            .body(Body::from(sse))
            .unwrap_or_else(|_| Json(body).into_response())
    } else {
        Json(body).into_response()
    }
}

async fn proxy_stream(
    state: AppState,
    mut req: ChatCompletionRequest,
    hash: String,
    preview: String,
    mode: String,
    lambda: f64,
    started: Instant,
) -> Result<Response, GatewayError> {
    req.stream = true;
    let upstream = state.openrouter.send(&req).await?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);

    if !status.is_success() {
        let body: Value = upstream.json().await.map_err(|err| {
            GatewayError::Upstream(format!("openrouter returned non-json: {err}"))
        })?;
        return Ok((status, Json(body)).into_response());
    }

    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("text/event-stream"));

    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(32);
    tokio::spawn(async move {
        let mut acc = Vec::new();
        let mut upstream = upstream;
        loop {
            match upstream.chunk().await {
                Ok(Some(chunk)) => {
                    acc.extend_from_slice(&chunk);
                    if tx.send(Ok(chunk)).await.is_err() {
                        break;
                    }
                }
                Ok(None) => break,
                Err(err) => {
                    let _ = tx.send(Err(std::io::Error::other(err))).await;
                    break;
                }
            }
        }
        drop(tx);

        if let Some(body) = reconstruct_from_sse(&acc) {
            let chosen = body
                .get("model")
                .and_then(Value::as_str)
                .unwrap_or(&state.default_model)
                .to_string();
            telemetry::record(
                &state,
                hash,
                preview,
                mode,
                lambda as f32,
                Outcome {
                    chosen_model: chosen,
                    body,
                    cache_hit: false,
                    latency_ms: started.elapsed().as_millis() as i32,
                },
            )
            .await;
        } else {
            tracing::warn!("could not reconstruct completion from SSE; skipping cache/log");
        }
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type)
        .header(CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(ReceiverStream::new(rx)))
        .map_err(|err| GatewayError::Upstream(err.to_string()))?)
}

pub async fn route_preview(
    State(state): State<AppState>,
    _auth: RequireApiKey,
    Json(payload): Json<serde_json::Value>,
) -> Result<Response, GatewayError> {
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
