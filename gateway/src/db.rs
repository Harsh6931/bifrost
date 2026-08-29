use std::collections::HashMap;
use std::time::Duration;

use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::types::Json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Clone, Copy, Debug)]
pub struct ModelPrice {
    pub in_per_1m: Decimal,
    pub out_per_1m: Decimal,
}

pub async fn connect() -> Option<PgPool> {
    let url = match std::env::var("DATABASE_URL") {
        Ok(url) if !url.is_empty() => url,
        _ => {
            tracing::warn!(
                "DATABASE_URL is not set; request logging and postgres cache are disabled"
            );
            return None;
        }
    };

    match PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&url)
        .await
    {
        Ok(pool) => {
            tracing::info!("connected to postgres");
            Some(pool)
        }
        Err(err) => {
            tracing::warn!(
                "DATABASE_URL is set but connect failed ({err}); continuing without db"
            );
            None
        }
    }
}

pub async fn load_prices(pool: &PgPool) -> HashMap<String, ModelPrice> {
    let rows = match sqlx::query(
        "SELECT id, price_in_per_1m, price_out_per_1m FROM model_registry",
    )
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(err) => {
            tracing::warn!("failed to load model_registry prices: {err}");
            return HashMap::new();
        }
    };

    let mut prices = HashMap::new();
    for row in rows {
        let id: String = row.get("id");
        let in_per_1m: Decimal = row.get("price_in_per_1m");
        let out_per_1m: Decimal = row.get("price_out_per_1m");
        prices.insert(id, ModelPrice { in_per_1m, out_per_1m });
    }
    tracing::info!(count = prices.len(), "loaded model registry prices");
    prices
}

pub fn token_cost(price: &ModelPrice, in_tok: i32, out_tok: i32) -> Decimal {
    let million = Decimal::from(1_000_000);
    Decimal::from(in_tok) * price.in_per_1m / million
        + Decimal::from(out_tok) * price.out_per_1m / million
}

pub async fn cache_get(pool: &PgPool, prompt_hash: &str) -> Option<Value> {
    let row = sqlx::query("SELECT response FROM response_cache WHERE prompt_hash = $1")
        .bind(prompt_hash)
        .fetch_optional(pool)
        .await
        .ok()??;

    let response: Value = row.get("response");
    if let Err(err) = sqlx::query(
        "UPDATE response_cache SET hits = hits + 1 WHERE prompt_hash = $1",
    )
    .bind(prompt_hash)
    .execute(pool)
    .await
    {
        tracing::warn!("failed to increment cache hits: {err}");
    }
    Some(response)
}

pub async fn cache_put(pool: &PgPool, prompt_hash: &str, model: &str, response: &Value) {
    if let Err(err) = sqlx::query(
        "INSERT INTO response_cache (prompt_hash, model, response, hits)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (prompt_hash) DO UPDATE
           SET model = EXCLUDED.model,
               response = EXCLUDED.response,
               created_at = now()",
    )
    .bind(prompt_hash)
    .bind(model)
    .bind(Json(response))
    .execute(pool)
    .await
    {
        tracing::warn!("failed to write response_cache: {err}");
    }
}

pub struct RequestLog {
    pub prompt_hash: String,
    pub prompt_preview: Option<String>,
    pub policy_mode: String,
    pub lambda: f32,
    pub chosen_model: String,
    pub actual_in_tokens: Option<i32>,
    pub actual_out_tokens: Option<i32>,
    pub actual_cost_usd: Option<Decimal>,
    pub latency_ms: i32,
    pub baseline_model: Option<String>,
    pub baseline_cost_usd: Option<Decimal>,
    pub savings_usd: Option<Decimal>,
    pub cache_hit: bool,
    pub explanation: Value,
}

pub async fn insert_request(pool: &PgPool, log: RequestLog) {
    let id = Uuid::new_v4();
    let result = sqlx::query(
        "INSERT INTO requests (
            id, prompt_hash, prompt_preview, policy_mode, lambda,
            chosen_model, actual_in_tokens, actual_out_tokens, actual_cost_usd,
            latency_ms, baseline_model, baseline_cost_usd, savings_usd,
            cache_hit, explanation
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15
         )",
    )
    .bind(id)
    .bind(&log.prompt_hash)
    .bind(&log.prompt_preview)
    .bind(&log.policy_mode)
    .bind(log.lambda)
    .bind(&log.chosen_model)
    .bind(log.actual_in_tokens)
    .bind(log.actual_out_tokens)
    .bind(log.actual_cost_usd)
    .bind(log.latency_ms)
    .bind(&log.baseline_model)
    .bind(log.baseline_cost_usd)
    .bind(log.savings_usd)
    .bind(log.cache_hit)
    .bind(Json(log.explanation))
    .execute(pool)
    .await;

    if let Err(err) = result {
        tracing::warn!("failed to insert requests row: {err}");
    }
}
