use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub enum GatewayError {
    Upstream(String),
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response {
        let GatewayError::Upstream(message) = self;
        tracing::error!(%message, "upstream error");
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": {
                    "message": message,
                    "type": "api_error"
                }
            })),
        )
            .into_response()
    }
}

impl From<reqwest::Error> for GatewayError {
    fn from(err: reqwest::Error) -> Self {
        GatewayError::Upstream(err.to_string())
    }
}
