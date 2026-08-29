use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use tokio::net::TcpListener;

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

    let app = Router::new().route("/health", get(health));

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
