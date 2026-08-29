use std::collections::HashMap;

use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use serde_json::{json, Value};

use crate::db::{self, ModelPrice, RequestLog};
use crate::AppState;

pub struct Outcome {
    pub chosen_model: String,
    pub body: Value,
    pub cache_hit: bool,
    pub latency_ms: i32,
}

pub fn savings(
    prices: &HashMap<String, ModelPrice>,
    baseline_model: &str,
    chosen_model: &str,
    in_tok: Option<i32>,
    out_tok: Option<i32>,
    cache_hit: bool,
    upstream_cost: Option<Decimal>,
) -> (Option<Decimal>, Option<Decimal>, Option<String>) {
    let (Some(inn), Some(out)) = (in_tok, out_tok) else {
        return (None, None, None);
    };

    let baseline_cost = prices.get(baseline_model).map(|p| db::token_cost(p, inn, out));
    let actual_cost = if cache_hit {
        Some(Decimal::ZERO)
    } else if let Some(cost) = upstream_cost {
        Some(cost)
    } else {
        prices.get(chosen_model).map(|p| db::token_cost(p, inn, out))
    };

    let savings = match (baseline_cost, actual_cost) {
        (Some(base), Some(actual)) => Some(base - actual),
        _ => None,
    };

    (
        actual_cost,
        savings,
        baseline_cost.is_some().then(|| baseline_model.to_string()),
    )
}

pub fn usage_tokens(body: &Value) -> (Option<i32>, Option<i32>, Option<Decimal>) {
    let Some(usage) = body.get("usage") else {
        return (None, None, None);
    };
    let inn = usage
        .get("prompt_tokens")
        .and_then(Value::as_i64)
        .map(|n| n as i32);
    let out = usage
        .get("completion_tokens")
        .and_then(Value::as_i64)
        .map(|n| n as i32);
    let cost = usage
        .get("cost")
        .or_else(|| usage.get("total_cost"))
        .and_then(Value::as_f64)
        .and_then(Decimal::from_f64);
    (inn, out, cost)
}

pub fn fallback_explanation(chosen_model: &str, cache_hit: bool) -> Value {
    json!({
        "method": "default_model",
        "summary": if cache_hit {
            format!("Exact-match cache hit for {chosen_model}; 100% savings vs a live call.")
        } else {
            format!("Dispatched to {chosen_model} (DEFAULT_MODEL). ML routing is not used.")
        },
        "cache_hit": cache_hit,
    })
}

pub async fn record(
    state: &AppState,
    prompt_hash: String,
    prompt_preview: String,
    policy_mode: String,
    lambda: f32,
    outcome: Outcome,
) {
    let (in_tok, out_tok, upstream_cost) = usage_tokens(&outcome.body);
    let (actual_cost, savings_usd, baseline_stored) = savings(
        &state.prices,
        &state.baseline_model,
        &outcome.chosen_model,
        in_tok,
        out_tok,
        outcome.cache_hit,
        upstream_cost,
    );
    let baseline_cost_usd = in_tok.zip(out_tok).and_then(|(inn, out)| {
        state
            .prices
            .get(&state.baseline_model)
            .map(|p| db::token_cost(p, inn, out))
    });

    let explanation = fallback_explanation(&outcome.chosen_model, outcome.cache_hit);

    if !outcome.cache_hit {
        state
            .cache
            .put(&prompt_hash, &outcome.chosen_model, &outcome.body)
            .await;
    }

    let Some(pool) = &state.db else {
        return;
    };

    db::insert_request(
        pool,
        RequestLog {
            prompt_hash,
            prompt_preview: Some(prompt_preview),
            policy_mode,
            lambda,
            chosen_model: outcome.chosen_model,
            actual_in_tokens: in_tok,
            actual_out_tokens: out_tok,
            actual_cost_usd: actual_cost,
            latency_ms: outcome.latency_ms,
            baseline_model: baseline_stored,
            baseline_cost_usd,
            savings_usd,
            cache_hit: outcome.cache_hit,
            explanation,
        },
    )
    .await;
}
