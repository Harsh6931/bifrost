use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::AppState;

pub struct RequireApiKey;

impl<S> FromRequestParts<S> for RequireApiKey
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let expected = AppState::from_ref(state).api_key;
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or(AuthError::Missing)?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AuthError::Invalid)?;

        if token != expected {
            return Err(AuthError::Invalid);
        }

        Ok(Self)
    }
}

pub enum AuthError {
    Missing,
    Invalid,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let message = match self {
            AuthError::Missing => "missing Authorization header",
            AuthError::Invalid => "invalid API key",
        };
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": {
                    "message": message,
                    "type": "invalid_request_error",
                    "code": "invalid_api_key"
                }
            })),
        )
            .into_response()
    }
}
