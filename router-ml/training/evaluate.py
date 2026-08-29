import sys
import numpy as np
import pandas as pd
from pathlib import Path

# Add root folder to sys.path
BASE_DIR = Path(__file__).parent.parent
sys.path.append(str(BASE_DIR))

from app.registry import ModelRegistry
from app.embed import EmbeddingModel
from app.knn import KNNPredictor
from app.scoring import RouterScorer

PROCESSED_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "models"

def main():
    test_csv_path = PROCESSED_DIR / "test.csv"
    if not test_csv_path.exists():
        print(f"Error: Test dataset not found at {test_csv_path}. Run prepare_data.py first.")
        return

    print("Loading test dataset...")
    test_df = pd.read_csv(test_csv_path)
    
    # We will evaluate on a subset of 200 samples for speed/efficiency in the hackathon
    EVAL_SAMPLES = 200
    if len(test_df) > EVAL_SAMPLES:
        test_df = test_df.sample(n=EVAL_SAMPLES, random_state=42).reset_index(drop=True)
    print(f"Evaluating over {len(test_df)} test prompts...")

    # Load registry, embedder, predictor, and scorer
    registry = ModelRegistry()
    embedder = EmbeddingModel()
    knn = KNNPredictor(models_dir=MODELS_DIR, registry=registry, k=10)
    scorer = RouterScorer(registry=registry)

    candidates = [
        "openai/gpt-5.5",
        "anthropic/claude-sonnet-4.6",
        "google/gemini-2.5-pro",
        "deepseek/deepseek-r1",
        "openai/gpt-5-mini",
        "qwen/qwen3.7-flash"
    ]

    # Metrics storage
    results = {
        "router_balanced": {"qualities": [], "costs": []},
        "router_cheap": {"qualities": [], "costs": []},
        "router_quality": {"qualities": [], "costs": []},
        "always_premium": {"qualities": [], "costs": []},
        "always_cheap": {"qualities": [], "costs": []},
        "random": {"qualities": [], "costs": []}
    }

    # For quality prediction MAE/RMSE calculations
    y_true_all = []
    y_pred_all = []

    print("Running evaluation loop...")
    for idx, row in test_df.iterrows():
        prompt = str(row["prompt"])
        
        # 1. Get ground truth values for the candidates
        ground_truth_qualities = {}
        ground_truth_costs = {}
        
        for c in candidates:
            cfg = registry.get_model(c)
            if not cfg:
                continue
            dataset_model = cfg.dataset_model_id
            
            # Read quality from column
            q_val = row.get(dataset_model, 0.0)
            if pd.isna(q_val):
                q_val = 0.0
            ground_truth_qualities[c] = float(q_val)
            
            # Read cost from column
            cost_col = f"{dataset_model}|total_cost"
            cost_val = row.get(cost_col, 0.0)
            if pd.isna(cost_val):
                # Fallback: estimate cost if not in dataset
                cost_val = scorer.calculate_model_cost(cfg, len(prompt)//4, 250)
            ground_truth_costs[c] = float(cost_val)

        # 2. Generate embedding
        query_embedding = embedder.embed_prompt(prompt)
        
        # 3. Predict qualities using KNN
        predicted_qualities, _ = knn.predict_quality(query_embedding, candidates)
        
        # Collect predictions for error metrics
        for c in candidates:
            y_true_all.append(ground_truth_qualities[c])
            y_pred_all.append(predicted_qualities[c])

        # 4. Route with different modes
        # A. Balanced
        chosen_bal, _ = scorer.score_models(prompt, predicted_qualities, candidates, "balanced", 0.5)
        results["router_balanced"]["qualities"].append(ground_truth_qualities[chosen_bal])
        results["router_balanced"]["costs"].append(ground_truth_costs[chosen_bal])
        
        # B. Cheap
        chosen_cheap, _ = scorer.score_models(prompt, predicted_qualities, candidates, "cheap", 0.9)
        results["router_cheap"]["qualities"].append(ground_truth_qualities[chosen_cheap])
        results["router_cheap"]["costs"].append(ground_truth_costs[chosen_cheap])
        
        # C. Quality
        chosen_qual, _ = scorer.score_models(prompt, predicted_qualities, candidates, "quality", 0.1)
        results["router_quality"]["qualities"].append(ground_truth_qualities[chosen_qual])
        results["router_quality"]["costs"].append(ground_truth_costs[chosen_qual])

        # 5. Route baselines
        # Always Premium (openai/gpt-5.5)
        results["always_premium"]["qualities"].append(ground_truth_qualities["openai/gpt-5.5"])
        results["always_premium"]["costs"].append(ground_truth_costs["openai/gpt-5.5"])

        # Always Cheap (qwen/qwen3.7-flash)
        results["always_cheap"]["qualities"].append(ground_truth_qualities["qwen/qwen3.7-flash"])
        results["always_cheap"]["costs"].append(ground_truth_costs["qwen/qwen3.7-flash"])

        # Random candidate
        rand_choice = np.random.choice(candidates)
        results["random"]["qualities"].append(ground_truth_qualities[rand_choice])
        results["random"]["costs"].append(ground_truth_costs[rand_choice])

    # Compute aggregate metrics
    y_true_all = np.array(y_true_all)
    y_pred_all = np.array(y_pred_all)
    mae = float(np.mean(np.abs(y_true_all - y_pred_all)))
    rmse = float(np.sqrt(np.mean((y_true_all - y_pred_all) ** 2)))

    print("\n================ EVALUATION SUMMARY ================")
    print(f"Quality Prediction MAE  : {mae:.4f}")
    print(f"Quality Prediction RMSE : {rmse:.4f}")
    print("----------------------------------------------------")
    
    summary_data = []
    for mode, data in results.items():
        avg_q = float(np.mean(data["qualities"]))
        avg_c = float(np.mean(data["costs"]))
        summary_data.append({
            "Mode": mode,
            "Avg Quality": avg_q,
            "Avg Cost (USD)": avg_c
        })
        
    summary_df = pd.DataFrame(summary_data)
    
    # Calculate savings and retention vs Always Premium
    premium_c = results["always_premium"]["costs"]
    premium_q = results["always_premium"]["qualities"]
    avg_premium_c = np.mean(premium_c)
    avg_premium_q = np.mean(premium_q)
    
    savings_list = []
    retention_list = []
    for idx, row in summary_df.iterrows():
        savings = 100.0 * (1.0 - (row["Avg Cost (USD)"] / avg_premium_c))
        retention = 100.0 * (row["Avg Quality"] / avg_premium_q)
        savings_list.append(f"{savings:.2f}%")
        retention_list.append(f"{retention:.2f}%")
        
    summary_df["Cost Savings (%)"] = savings_list
    summary_df["Quality Retention (%)"] = retention_list
    
    print(summary_df.to_string(index=False))
    print("====================================================")
    
    # Save the output evaluation table
    output_path = BASE_DIR / "models" / "evaluation_results.csv"
    summary_df.to_csv(output_path, index=False)
    print(f"Evaluation report saved to {output_path}")

if __name__ == "__main__":
    main()
