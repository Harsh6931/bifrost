use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::RwLock;

use crate::db;

#[derive(Clone)]
pub struct ResponseCache {
    db: Option<PgPool>,
    mem: Arc<RwLock<HashMap<String, Value>>>,
}

impl ResponseCache {
    pub fn new(db: Option<PgPool>) -> Self {
        Self {
            db,
            mem: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get(&self, prompt_hash: &str) -> Option<Value> {
        if let Some(pool) = &self.db {
            if let Some(value) = db::cache_get(pool, prompt_hash).await {
                return Some(value);
            }
        }
        self.mem.read().await.get(prompt_hash).cloned()
    }

    pub async fn put(&self, prompt_hash: &str, model: &str, response: &Value) {
        if let Some(pool) = &self.db {
            db::cache_put(pool, prompt_hash, model, response).await;
            return;
        }
        self.mem
            .write()
            .await
            .insert(prompt_hash.to_string(), response.clone());
    }
}
