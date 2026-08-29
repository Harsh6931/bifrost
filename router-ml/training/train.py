import os
import pandas as pd
import numpy as np
from pathlib import Path
import sys

# Add root folder to sys.path so we can import app modules
BASE_DIR = Path(__file__).parent.parent
sys.path.append(str(BASE_DIR))

from app.embed import EmbeddingModel

PROCESSED_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

def main():
    train_csv_path = PROCESSED_DIR / "train.csv"
    if not train_csv_path.exists():
        print(f"Error: Train dataset not found at {train_csv_path}. Please run prepare_data.py first.")
        return

    print("Loading training dataset...")
    df = pd.read_csv(train_csv_path)

    # Clean missing prompts if any
    df = df.dropna(subset=["prompt"]).copy()
    
    # We want to embed the unique prompts to prevent duplicating embedding work.
    print(f"Total rows in train split: {len(df)}")
    df_unique = df.drop_duplicates(subset=["prompt"]).copy().reset_index(drop=True)
    
    # For hackathon/speed purposes, limit the training corpus size (default: 300 samples)
    MAX_CORPUS_SIZE = int(os.environ.get("MAX_CORPUS_SIZE", 300))
    if len(df_unique) > MAX_CORPUS_SIZE:
        print(f"Limiting training corpus from {len(df_unique)} to {MAX_CORPUS_SIZE} for faster embedding generation.")
        df_unique = df_unique.iloc[:MAX_CORPUS_SIZE].copy().reset_index(drop=True)
        
    prompts = df_unique["prompt"].tolist()
    print(f"Unique prompts in training split: {len(df_unique)}")

    # Paths for checkpoints
    partial_npy_path = MODELS_DIR / "train_embeddings_partial.npy"
    final_npy_path = MODELS_DIR / "train_embeddings.npy"
    metadata_path = MODELS_DIR / "train_metadata.csv"

    # Initialize the embedding model
    print("Loading embedding model BAAI/bge-small-en-v1.5...")
    embedder = EmbeddingModel()

    # Check for existing partial progress
    start_idx = 0
    existing_embeddings = []
    if partial_npy_path.exists():
        try:
            existing_embeddings = np.load(partial_npy_path)
            start_idx = len(existing_embeddings)
            print(f"Found existing partial index with {start_idx} embeddings. Resuming from prompt index {start_idx}...")
        except Exception as e:
            print(f"Error reading partial file, starting from scratch: {e}")
            start_idx = 0

    batch_size = 128
    print(f"Generating embeddings in batches of {batch_size} (starting from index {start_idx})...")

    # If start_idx < len(prompts), we have remaining prompts to embed
    if start_idx < len(prompts):
        for i in range(start_idx, len(prompts), batch_size):
            batch = prompts[i:i+batch_size]
            print(f"Embedding batch {i//batch_size + 1}/{int(np.ceil(len(prompts)/batch_size))} ({i} to {min(i+batch_size, len(prompts))})...", flush=True)
            batch_embeddings = embedder.embed_prompts(batch)
            
            if len(existing_embeddings) == 0:
                existing_embeddings = batch_embeddings
            else:
                existing_embeddings = np.vstack([existing_embeddings, batch_embeddings])
            
            # Save partial progress to disk after each batch
            np.save(partial_npy_path, existing_embeddings)

    print("Embedding generation completed. Saving final files...")
    
    # Save final embedding matrix
    np.save(final_npy_path, existing_embeddings)
    
    # Save corresponding metadata DataFrame (prompts + quality scores + costs for each model)
    df_unique.to_csv(metadata_path, index=False)
    
    # Clean up partial progress file
    if partial_npy_path.exists():
        os.remove(partial_npy_path)
        
    print(f"Saved final embedding matrix of shape {existing_embeddings.shape} to {final_npy_path}")
    print(f"Saved training metadata to {metadata_path}")
    print("Offline training (index preparation) completed successfully!")

if __name__ == "__main__":
    main()
