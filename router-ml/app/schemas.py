from pydantic import BaseModel, Field
from typing import List, Optional

class RoutePolicy(BaseModel):
    mode: str = "balanced"  # 'quality' | 'balanced' | 'cheap'
    lambda_: float = Field(default=0.5, alias="lambda")
    max_cost_usd: float = 0.01

    class Config:
        populate_by_name = True

class RouteRequest(BaseModel):
    prompt: str
    candidates: List[str]
    policy: RoutePolicy

class ModelScore(BaseModel):
    model: str
    pred_quality: float
    est_cost_usd: float
    est_latency_ms: int
    score: float

class NeighborInfo(BaseModel):
    prompt: str
    winner: str
    sim: float

class RouteExplanation(BaseModel):
    method: str = "knn"  # 'knn' | 'lgbm'
    summary: str
    neighbors: List[NeighborInfo]
    baseline_model: str
    est_savings_usd: float

class TimingInfo(BaseModel):
    embed: float
    predict: float

class RouteResponse(BaseModel):
    chosen: str
    scores: List[ModelScore]
    explanation: RouteExplanation
    timing_ms: TimingInfo
