import os
import sys
import numpy as np
from pathlib import Path
from fastapi.testclient import TestClient

# Add root folder to sys.path
BASE_DIR = Path(__file__).parent.parent
sys.path.append(str(BASE_DIR))

from app.registry import ModelRegistry, ModelConfig
from app.embed import EmbeddingModel
from app.knn import KNNPredictor
from app.scoring import RouterScorer
from app.main import app

def test_registry_loading():
    """Verifies registry configuration parses correctly."""
    registry = ModelRegistry()
    active_models = registry.list_active_models()
    assert len(active_models) > 0
    
    gpt5 = registry.get_model("openai/gpt-5.5")
    assert gpt5 is not None
    assert gpt5.dataset_model_id == "gpt-4-1106-preview"
    assert gpt5.price_in_per_1m == 5.0

def test_embedding_generation():
    """Verifies that the embedding generator outputs 384-dimensional vectors."""
    embedder = EmbeddingModel()
    vec = embedder.embed_prompt("test prompt")
    assert isinstance(vec, np.ndarray)
    assert vec.shape == (384,)
    
    matrix = embedder.embed_prompts(["hello", "world"])
    assert matrix.shape == (2, 384)

def test_knn_retrieval_and_fallbacks():
    """Verifies k-NN math and missing data fallbacks work as expected."""
    registry = ModelRegistry()
    models_dir = BASE_DIR / "models"
    knn = KNNPredictor(models_dir=models_dir, registry=registry, k=3)
    
    query_prompt = knn.train_df["prompt"].iloc[0]
    embedder = EmbeddingModel()
    query_vec = embedder.embed_prompt(query_prompt)
    
    candidates = ["openai/gpt-5.5", "openai/gpt-5-mini", "qwen/qwen3.7-flash"]
    qualities, neighbors = knn.predict_quality(query_vec, candidates)
    
    assert len(qualities) == len(candidates)
    assert len(neighbors) == 3
    assert neighbors[0]["prompt"] == query_prompt
    assert neighbors[0]["sim"] > 0.95

def test_scoring_logic():
    """Verifies normalizations, quality safety checks, and lambda composite scoring."""
    registry = ModelRegistry()
    scorer = RouterScorer(registry=registry)
    
    predicted_qualities = {
        "openai/gpt-5.5": 0.95,
        "openai/gpt-5-mini": 0.70,
        "qwen/qwen3.7-flash": 0.50
    }
    candidates = list(predicted_qualities.keys())
    
    # 1. Test balanced mode (lambda = 0.5)
    chosen_balanced, scores_details = scorer.score_models(
        prompt="Explain quantum physics",
        predicted_qualities=predicted_qualities,
        candidates=candidates,
        policy_mode="balanced",
        lambda_val=0.5
    )
    assert chosen_balanced in candidates
    
    # 2. Test cheap mode (lambda = 0.9)
    chosen_cheap, _ = scorer.score_models(
        prompt="Explain quantum physics",
        predicted_qualities=predicted_qualities,
        candidates=candidates,
        policy_mode="cheap",
        lambda_val=0.9
    )
    assert chosen_cheap != "openai/gpt-5.5"

def test_api_endpoints():
    """Verifies health check and route endpoints E2E using TestClient."""
    with TestClient(app) as client:
        # 1. Health check
        res_health = client.get("/health")
        assert res_health.status_code == 200
        data_health = res_health.json()
        assert data_health["status"] == "ok"
        assert data_health["corpus_loaded"] is True
        
        # 2. Route completions
        payload = {
            "prompt": "write a python quicksort",
            "candidates": ["openai/gpt-5.5", "openai/gpt-5-mini", "qwen/qwen3.7-flash"],
            "policy": {
                "mode": "balanced",
                "lambda": 0.5,
                "max_cost_usd": 0.01
            }
        }
        res_route = client.post("/route", json=payload)
        assert res_route.status_code == 200
        data_route = res_route.json()
        assert "chosen" in data_route
        assert len(data_route["scores"]) == 3
        assert "explanation" in data_route
        assert "summary" in data_route["explanation"]
        assert len(data_route["explanation"]["neighbors"]) > 0
        assert data_route["timing_ms"]["embed"] > 0
