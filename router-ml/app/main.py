import os
import time
from pathlib import Path
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager

from app.registry import ModelRegistry
from app.embed import EmbeddingModel
from app.knn import KNNPredictor
from app.scoring import RouterScorer
from app.explanation import ExplanationGenerator
from app.schemas import RouteRequest, RouteResponse, TimingInfo

# State containers
registry = None
embedder = None
knn_predictor = None
scorer = None
explainer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Loads all models, registries, and vectors into memory at startup."""
    global registry, embedder, knn_predictor, scorer, explainer
    
    print("Starting up Bifrost ML Router...")
    try:
        # 1. Load Registry
        registry = ModelRegistry()
        print("Model registry loaded successfully.")
        
        # 2. Load Embedding Model
        embedder = EmbeddingModel()
        print("Local BGE embedding model initialized successfully.")
        
        # 3. Load KNN Predictor
        models_dir = Path(__file__).parent.parent / "models"
        knn_k = int(os.environ.get("KNN_K", 10))
        knn_predictor = KNNPredictor(models_dir=models_dir, registry=registry, k=knn_k)
        print(f"KNN Predictor initialized with k={knn_k} and {len(knn_predictor.train_df)} training prompts.")
        
        # 4. Initialize Scorer and Explainer
        scorer = RouterScorer(registry=registry)
        explainer = ExplanationGenerator(registry=registry)
        print("Scoring and explanation modules initialized.")
        
    except Exception as e:
        print(f"CRITICAL ERROR during Bifrost ML Service startup: {e}")
        
    yield
    print("Shutting down Bifrost ML Router...")

app = FastAPI(
    title="Bifrost ML Router",
    description="Intelligent gateways for dynamic LLM prompt routing",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health")
def health():
    """Health check endpoint to monitor model loading status."""
    is_ready = (
        registry is not None
        and embedder is not None
        and knn_predictor is not None
        and knn_predictor.train_embeddings is not None
    )
    
    return {
        "status": "ok" if is_ready else "error",
        "embedding_model": embedder.model_name if embedder else "uninitialized",
        "predictor": "knn",
        "corpus_loaded": (knn_predictor.train_embeddings is not None) if knn_predictor else False,
        "registry_count": len(registry.models) if registry else 0
    }

@app.post("/route", response_model=RouteResponse)
def route(req: RouteRequest):
    """Processes prompt embedding, retrieves neighbors, scores, and selects optimal model."""
    if not req.candidates:
        raise HTTPException(status_code=400, detail="Candidates list must not be empty.")
        
    # Check if models are loaded
    if not embedder or not knn_predictor or knn_predictor.train_embeddings is None:
        raise HTTPException(
            status_code=503, 
            detail="ML Service is currently warming up or uninitialized."
        )

    t_start = time.time()
    
    # 1. Embed query prompt
    t_embed_start = time.time()
    query_vector = embedder.embed_prompt(req.prompt)
    t_embed_end = time.time()
    
    # 2. Predict quality using k-NN retrieval
    t_predict_start = time.time()
    predicted_qualities, neighbor_details = knn_predictor.predict_quality(
        query_embedding=query_vector,
        candidates=req.candidates
    )
    
    # 3. Calculate scores based on policy
    lambda_val = req.policy.lambda_
    max_cost_usd = req.policy.max_cost_usd
    
    # Expose quality safety threshold via environment variable
    min_quality = float(os.environ.get("MINIMUM_QUALITY_THRESHOLD", 0.0))
    if min_quality == 0.0:
        min_quality = None
        
    chosen_model, scores_details = scorer.score_models(
        prompt=req.prompt,
        predicted_qualities=predicted_qualities,
        candidates=req.candidates,
        policy_mode=req.policy.mode,
        lambda_val=lambda_val,
        max_cost_usd=max_cost_usd,
        min_quality_threshold=min_quality
    )
    
    # 4. Generate explainability payload
    explanation = explainer.generate_explanation(
        chosen_model_id=chosen_model,
        scores_details=scores_details,
        neighbor_details=neighbor_details,
        candidates=req.candidates
    )
    t_predict_end = time.time()
    
    t_total_end = time.time()
    
    # Timings in milliseconds
    embed_ms = (t_embed_end - t_embed_start) * 1000.0
    predict_ms = (t_predict_end - t_predict_start) * 1000.0
    
    return RouteResponse(
        chosen=chosen_model,
        scores=scores_details,
        explanation=explanation,
        timing_ms=TimingInfo(
            embed=round(embed_ms, 2),
            predict=round(predict_ms, 2)
        )
    )
