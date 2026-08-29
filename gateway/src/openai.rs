use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatCompletionRequest {
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub stream: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Value,
}

pub fn content_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str).map(str::to_string))
            .collect::<Vec<_>>()
            .join("\n"),
        other => other.to_string(),
    }
}

pub fn prompt_preview(messages: &[ChatMessage]) -> String {
    let text = messages
        .iter()
        .map(|m| content_text(&m.content))
        .collect::<Vec<_>>()
        .join("\n");
    text.chars().take(200).collect()
}

pub fn prompt_policy_hash(messages: &[ChatMessage], mode: &str, lambda: f64) -> String {
    let lambda = (lambda * 10_000.0).round() / 10_000.0;
    let payload = json!({
        "messages": messages,
        "mode": mode,
        "lambda": lambda,
    });
    format!("{:x}", Sha256::digest(payload.to_string().as_bytes()))
}

pub fn assistant_content(body: &Value) -> String {
    body.get("choices")
        .and_then(Value::as_array)
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Replay a stored non-stream completion as OpenAI-style SSE.
pub fn completion_to_sse(body: &Value) -> String {
    let content = assistant_content(body);
    let model = body.get("model").cloned().unwrap_or(Value::Null);
    let id = body.get("id").cloned().unwrap_or(json!("cached"));
    let chunk = json!({
        "id": id,
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{
            "index": 0,
            "delta": { "role": "assistant", "content": content },
            "finish_reason": null
        }]
    });
    let done = json!({
        "id": body.get("id").cloned().unwrap_or(json!("cached")),
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {},
            "finish_reason": "stop"
        }],
        "usage": body.get("usage").cloned().unwrap_or(Value::Null)
    });
    format!("data: {chunk}\n\ndata: {done}\n\ndata: [DONE]\n\n")
}

/// Rebuild a chat.completion JSON from an OpenRouter SSE byte buffer so we can cache it.
pub fn reconstruct_from_sse(bytes: &[u8]) -> Option<Value> {
    let text = String::from_utf8_lossy(bytes);
    let mut content = String::new();
    let mut model = Value::Null;
    let mut id = Value::Null;
    let mut usage = Value::Null;
    let mut saw_chunk = false;

    for raw in text.split("\n") {
        let line = raw.trim();
        let Some(payload) = line.strip_prefix("data:") else {
            continue;
        };
        let payload = payload.trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        let Ok(chunk) = serde_json::from_str::<Value>(payload) else {
            continue;
        };
        saw_chunk = true;
        if model.is_null() {
            if let Some(m) = chunk.get("model") {
                model = m.clone();
            }
        }
        if id.is_null() {
            if let Some(v) = chunk.get("id") {
                id = v.clone();
            }
        }
        if let Some(u) = chunk.get("usage") {
            if !u.is_null() {
                usage = u.clone();
            }
        }
        if let Some(token) = chunk
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|c| c.first())
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(Value::as_str)
        {
            content.push_str(token);
        }
    }

    if !saw_chunk {
        return None;
    }

    Some(json!({
        "id": id,
        "object": "chat.completion",
        "model": model,
        "choices": [{
            "index": 0,
            "message": { "role": "assistant", "content": content },
            "finish_reason": "stop"
        }],
        "usage": usage
    }))
}
