from typing import List, Dict, Any
from app.registry import ModelRegistry, ModelConfig
from app.schemas import RouteExplanation, NeighborInfo

class ExplanationGenerator:
    def __init__(self, registry: ModelRegistry):
        self.registry = registry

    def generate_explanation(
        self,
        chosen_model_id: str,
        scores_details: List[Dict[str, Any]],
        neighbor_details: List[Dict[str, Any]],
        candidates: List[str]
    ) -> RouteExplanation:
        """Generates the explanation summary and savings estimation."""
        
        # 1. Find the baseline model (highest cost/premium model in the candidate configs)
        baseline_model_id = None
        max_cost_in = -1.0
        
        candidate_configs = {}
        for c in candidates:
            cfg = self.registry.get_model(c)
            if cfg:
                candidate_configs[c] = cfg
                # Baseline is the most expensive enabled model in the candidates list
                if cfg.price_in_per_1m > max_cost_in:
                    max_cost_in = cfg.price_in_per_1m
                    baseline_model_id = c
                    
        # Fallback if no config matches
        if not baseline_model_id:
            baseline_model_id = candidates[0] if candidates else chosen_model_id
            
        # Get details of chosen and baseline from scores_details
        chosen_score_detail = next((s for s in scores_details if s["model"] == chosen_model_id), None)
        baseline_score_detail = next((s for s in scores_details if s["model"] == baseline_model_id), None)
        
        # Calculate estimated savings
        est_savings = 0.0
        if chosen_score_detail and baseline_score_detail:
            est_savings = max(0.0, baseline_score_detail["est_cost_usd"] - chosen_score_detail["est_cost_usd"])
            
        # 2. Build summary sentence
        chosen_cfg = self.registry.get_model(chosen_model_id)
        baseline_cfg = self.registry.get_model(baseline_model_id)
        
        chosen_name = chosen_cfg.display_name if chosen_cfg else chosen_model_id
        baseline_name = baseline_cfg.display_name if baseline_cfg else baseline_model_id
        
        if chosen_model_id == baseline_model_id:
            summary = f"Routed to {chosen_name} because it is the baseline model required to guarantee the highest quality for this prompt."
        else:
            # Calculate cost fraction
            cost_fraction_str = ""
            if chosen_cfg and baseline_cfg and chosen_cfg.price_in_per_1m > 0:
                cost_ratio = baseline_cfg.price_in_per_1m / chosen_cfg.price_in_per_1m
                if cost_ratio >= 1.5:
                    cost_fraction_str = f" at 1/{int(round(cost_ratio))}th of the cost"
            
            # Count neighbor occurrences
            k = len(neighbor_details)
            summary = f"Routed to {chosen_name} because across {k} similar prompts in our dataset, it delivered comparable quality to {baseline_name}{cost_fraction_str}."

        # 3. Build neighbor list matching schema
        neighbors = []
        for n in neighbor_details:
            neighbors.append(NeighborInfo(
                prompt=n["prompt"],
                winner=n["winner"],
                sim=float(n["sim"])
            ))

        return RouteExplanation(
            method="knn",
            summary=summary,
            neighbors=neighbors,
            baseline_model=baseline_model_id,
            est_savings_usd=float(round(est_savings, 6))
        )
