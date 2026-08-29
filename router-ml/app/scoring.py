import os
import tiktoken
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
from app.registry import ModelRegistry, ModelConfig

class RouterScorer:
    def __init__(self, registry: ModelRegistry):
        self.registry = registry
        # Initialize tiktoken encoder once at startup
        try:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
        except Exception:
            # Fallback if offline
            self.tokenizer = None

    def estimate_input_tokens(self, prompt: str) -> int:
        """Estimates input tokens using cl100k_base or simple char length fallback."""
        if self.tokenizer:
            try:
                return len(self.tokenizer.encode(prompt))
            except Exception:
                pass
        # Fallback heuristic: 1 token ~= 4 characters
        return max(1, len(prompt) // 4)

    def calculate_model_cost(self, model: ModelConfig, in_tokens: int, out_tokens: int) -> float:
        """Calculates estimated cost in USD."""
        return (in_tokens * model.price_in_per_1m + out_tokens * model.price_out_per_1m) / 1e6

    def score_models(
        self,
        prompt: str,
        predicted_qualities: Dict[str, float],
        candidates: List[str],
        policy_mode: str,
        lambda_val: float,
        max_cost_usd: Optional[float] = None,
        min_quality_threshold: Optional[float] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Scores all candidate models based on qualities and costs, returning the chosen model.
        
        Args:
            prompt: User input prompt
            predicted_qualities: Dict mapping model_id -> predicted quality score
            candidates: List of active candidate model IDs
            policy_mode: 'quality' | 'balanced' | 'cheap'
            lambda_val: Penalty multiplier [0.0, 1.0]
            max_cost_usd: Maximum allowed cost in USD (hard limit)
            min_quality_threshold: Configurable minimum quality safety threshold
            
        Returns:
            Tuple of:
              - Chosen model ID
              - List of model score detail dicts for the API response
        """
        in_tokens = self.estimate_input_tokens(prompt)
        # Average output tokens heuristic (250 tokens)
        out_tokens = 250
        
        # Load registry configurations for candidates
        candidate_configs: Dict[str, ModelConfig] = {}
        for c in candidates:
            cfg = self.registry.get_model(c)
            if cfg and cfg.enabled:
                candidate_configs[c] = cfg
                
        if not candidate_configs:
            # Fallback: if no candidates in registry, pick the first requested candidate
            default_choice = candidates[0] if candidates else "unknown"
            return default_choice, []
            
        # 1. Compute costs and filter by hard constraints (context length + max cost limit)
        model_costs = {}
        filtered_candidates = []
        
        for c, cfg in candidate_configs.items():
            # Hard limit: Context length constraint
            if in_tokens > cfg.context_length:
                continue
                
            cost = self.calculate_model_cost(cfg, in_tokens, out_tokens)
            
            # Hard limit: Max cost limit check
            if max_cost_usd is not None and max_cost_usd > 0 and cost > max_cost_usd:
                continue
                
            model_costs[c] = cost
            filtered_candidates.append(c)
            
        if not filtered_candidates:
            # If all candidates filtered by hard constraints, recover the cheapest candidate
            cheapest = min(candidate_configs.items(), key=lambda x: x[1].price_in_per_1m)[0]
            filtered_candidates = [cheapest]
            model_costs[cheapest] = self.calculate_model_cost(candidate_configs[cheapest], in_tokens, out_tokens)
            
        # 2. Normalize costs among the filtered candidates
        costs_list = [model_costs[c] for c in filtered_candidates]
        min_cost = min(costs_list)
        max_cost = max(costs_list)
        cost_range = max_cost - min_cost
        epsilon = 1e-9
        
        normalized_costs = {}
        for c in filtered_candidates:
            cost = model_costs[c]
            if cost_range > 0:
                normalized_costs[c] = (cost - min_cost) / (cost_range + epsilon)
            else:
                normalized_costs[c] = 0.0
                
        # 3. Apply safety quality threshold check
        # We try to keep only candidates that pass the minimum quality threshold (e.g. 0.85).
        passing_quality_candidates = []
        if min_quality_threshold is not None and min_quality_threshold > 0:
            for c in filtered_candidates:
                q_pred = predicted_qualities.get(c, 0.5)
                if q_pred >= min_quality_threshold:
                    passing_quality_candidates.append(c)
                    
        # Fallback: if NO model passes the safety threshold, use all filtered candidates
        if not passing_quality_candidates:
            passing_quality_candidates = filtered_candidates
            
        # 4. Compute composite scores
        scores_details = []
        for c in filtered_candidates:
            q_pred = predicted_qualities.get(c, 0.5)
            c_norm = normalized_costs[c]
            est_cost = model_costs[c]
            
            # Composite score formula: q_pred - lambda * c_norm
            comp_score = q_pred - lambda_val * c_norm
            
            cfg = candidate_configs[c]
            est_latency = cfg.avg_latency_ms if cfg.avg_latency_ms else 2000
            
            scores_details.append({
                "model": c,
                "pred_quality": float(np.round(q_pred, 4)),
                "est_cost_usd": float(np.round(est_cost, 6)),
                "est_latency_ms": est_latency,
                "score": float(np.round(comp_score, 4))
            })
            
        # 5. Choose winner from passing_quality_candidates
        winner_details = [s for s in scores_details if s["model"] in passing_quality_candidates]
        if winner_details:
            chosen = max(winner_details, key=lambda x: x["score"])["model"]
        else:
            chosen = max(scores_details, key=lambda x: x["score"])["model"]
            
        # Sort score details for API visibility (highest score first)
        scores_details = sorted(scores_details, key=lambda x: x["score"], reverse=True)
        
        return chosen, scores_details
