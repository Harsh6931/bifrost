mod auth;
mod chat;
mod error;
mod openai;
mod providers;

use std::time::Duration;

use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tokio::net::TcpListener;

use crate::providers::openrouter::OpenRouter;

#[derive(Clone)]
pub(crate) struct AppState {
    pub api_key: String,
    pub default_model: String,
    pub openrouter: OpenRouter,
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gateway=debug".into()),
        )
        .with_target(false)
        .compact()
        .init();

    let port: u16 = std::env::var("GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let api_key = std::env::var("BIFROST_API_KEY").unwrap_or_else(|_| "dev-local-key".into());
    let default_model =
        std::env::var("DEFAULT_MODEL").unwrap_or_else(|_| "openai/gpt-5-mini".into());
    let openrouter_key = std::env::var("OPENROUTER_API_KEY").unwrap_or_default();

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .expect("http client");

    let app = Router::new()
        .route("/health", get(health))
        .route("/chat/completions", post(chat::chat_completions))
        .with_state(AppState {
            api_key,
            default_model,
            openrouter: OpenRouter::new(http, openrouter_key),
        });

    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|err| panic!("failed to bind {addr}: {err}"));

    tracing::info!("listening on {addr}");
    axum::serve(listener, app)
        .await
        .expect("gateway server failed");
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
