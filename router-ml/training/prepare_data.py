import os
import hashlib
import pandas as pd
from pathlib import Path
from huggingface_hub import hf_hub_download

# Define paths
BASE_DIR = Path(__file__).parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

def load_raw_dataset() -> pd.DataFrame:
    """Loads RouterBench dataset. Attempts HF download first, then local raw folder, then generates synthetic fallback."""
    pkl_filename = "routerbench_0shot.pkl"
    local_raw_path = RAW_DIR / pkl_filename

    # 1. Try HF download
    try:
        print("Attempting to load dataset from Hugging Face...")
        path = hf_hub_download(
            repo_id="withmartian/routerbench",
            filename=pkl_filename,
            repo_type="dataset"
        )
        print(f"Dataset successfully loaded from HF cache: {path}")
        return pd.read_pickle(path)
    except Exception as e:
        print(f"HF Download failed: {e}")

    # 2. Try Local raw folder
    if local_raw_path.exists():
        print(f"Loading dataset from local raw path: {local_raw_path}")
        return pd.read_pickle(local_raw_path)

    # 3. Fallback: Generate Synthetic Dataset for development
    print("WARNING: No raw dataset found. Generating synthetic fallback dataset for local development.")
    return generate_synthetic_dataset()

def generate_synthetic_dataset(num_samples: int = 1000) -> pd.DataFrame:
    """Generates a synthetic RouterBench-shaped dataset for offline/local development."""
    import numpy as np
    
    models = [
        "gpt-4-1106-preview",
        "gpt-3.5-turbo-1106",
        "claude-instant-v1",
        "claude-v1",
        "claude-v2",
        "mistralai/mistral-7b-chat",
        "mistralai/mixtral-8x7b-chat",
        "zero-one-ai/Yi-34B-Chat",
        "WizardLM/WizardLM-13B-V1.2",
        "meta/code-llama-instruct-34b-chat",
        "meta/llama-2-70b-chat"
    ]
    
    categories = ["coding", "math", "chat", "extraction", "general"]
    prompts = [
        "Explain quantum computing like I'm five.",
        "Write a python function to reverse a linked list.",
        "Solve for x: 3x + 5 = 20.",
        "Extract the date and time from this email: 'Meeting scheduled on October 12 at 3 PM'",
        "What is the capital of France?",
        "How do I deploy a docker container to AWS ECS?",
        "Summarize this text: 'Artificial intelligence is transforming industries...'",
        "Write a SQL query to find the second highest salary.",
        "Why is the sky blue?",
        "Design a system architecture for a real-time chat application."
    ]
    
    data = []
    for i in range(num_samples):
        cat = categories[i % len(categories)]
        base_prompt = prompts[i % len(prompts)]
        prompt = f"[{cat.upper()}] {base_prompt} (Sample variation {i})"
        
        row = {
            "sample_id": f"synthetic.{cat}.{i}",
            "prompt": prompt,
            "eval_name": f"synthetic.{cat}"
        }
        
        # Add performance, responses, and costs for each model
        for model in models:
            # High-tier models perform better but cost more
            is_premium = "gpt-4" in model or "claude-v2" in model
            is_cheap = "mistral" in model or "gpt-3.5" in model
            
            if is_premium:
                quality = 1.0 if np.random.rand() < 0.9 else 0.0
                cost = 0.01 + np.random.rand() * 0.005
            elif is_cheap:
                quality = 1.0 if np.random.rand() < 0.6 else 0.0
                cost = 0.0005 + np.random.rand() * 0.0002
            else:
                quality = 1.0 if np.random.rand() < 0.75 else 0.0
                cost = 0.002 + np.random.rand() * 0.001
                
            row[model] = quality
            row[f"{model}|model_response"] = f"Response from {model} for sample {i}"
            row[f"{model}|total_cost"] = cost
            
        row["oracle_model_to_route_to"] = models[0] # Mock
        data.append(row)
        
    return pd.DataFrame(data)

def split_dataset(df: pd.DataFrame, train_ratio: float = 0.8, val_ratio: float = 0.1):
    """Splits dataset on unique prompt text to prevent data leakage."""
    print("Splitting dataset...")
    
    # Extract unique prompts and shuffle them deterministically
    unique_prompts = df["prompt"].unique()
    unique_prompts = sorted(unique_prompts) # Sort for deterministic hash-based shuffle
    
    # Shuffle using hashlib to be independent of random seeds and stay reproducible
    def get_hash_bucket(text: str) -> float:
        # Returns a float in [0, 1) based on md5 hash
        return int(hashlib.md5(text.encode("utf-8")).hexdigest(), 16) / (16**32)
        
    # Assign each prompt to a split
    train_prompts = []
    val_prompts = []
    test_prompts = []
    
    for p in unique_prompts:
        h = get_hash_bucket(p)
        if h < train_ratio:
            train_prompts.append(p)
        elif h < (train_ratio + val_ratio):
            val_prompts.append(p)
        else:
            test_prompts.append(p)
            
    train_set = set(train_prompts)
    val_set = set(val_prompts)
    test_set = set(test_prompts)
    
    df_train = df[df["prompt"].isin(train_set)].copy()
    df_val = df[df["prompt"].isin(val_set)].copy()
    df_test = df[df["prompt"].isin(test_set)].copy()
    
    print(f"Split results:")
    print(f"  Train: {len(df_train)} rows ({len(train_set)} unique prompts)")
    print(f"  Val:   {len(df_val)} rows ({len(val_set)} unique prompts)")
    print(f"  Test:  {len(df_test)} rows ({len(test_set)} unique prompts)")
    
    return df_train, df_val, df_test

def main():
    df = load_raw_dataset()
    
    # Basic data cleaning: drop rows with missing prompts
    df = df.dropna(subset=["prompt"]).copy()
    
    # Split
    df_train, df_val, df_test = split_dataset(df)
    
    # Save to processed folder
    df_train.to_csv(PROCESSED_DIR / "train.csv", index=False)
    df_val.to_csv(PROCESSED_DIR / "val.csv", index=False)
    df_test.to_csv(PROCESSED_DIR / "test.csv", index=False)
    
    print(f"Successfully saved splits to {PROCESSED_DIR}")

if __name__ == "__main__":
    main()
