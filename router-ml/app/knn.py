import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from app.registry import ModelRegistry, ModelConfig

class KNNPredictor:
    def __init__(self, models_dir: Path, registry: ModelRegistry, k: int = 10):
        self.models_dir = models_dir
        self.registry = registry
        self.k = k
        
        self.embeddings_path = models_dir / "train_embeddings.npy"
        self.metadata_path = models_dir / "train_metadata.csv"
        
        self.train_embeddings = None
        self.train_df = None
        self.global_averages = {}
        
        self.load()

    def load(self) -> None:
        """Loads the saved embeddings and metadata from disk and prepares them."""
        if not self.embeddings_path.exists() or not self.metadata_path.exists():
            raise FileNotFoundError(
                f"Missing training index files. Please run training pipeline first. "
                f"Expected {self.embeddings_path} and {self.metadata_path}"
            )
            
        # Load embedding matrix and normalize it for fast cosine similarity dot product
        raw_embeddings = np.load(self.embeddings_path)
        norms = np.linalg.norm(raw_embeddings, axis=1, keepdims=True)
        # Avoid division by zero
        norms = np.where(norms == 0, 1.0, norms)
        self.train_embeddings = raw_embeddings / norms
        
        # Load metadata
        self.train_df = pd.read_csv(self.metadata_path)
        
        # Calculate global quality averages for each model in the dataset
        # to use as Level 2 fallback
        for col in self.train_df.columns:
            # Check if this column is one of our dataset model IDs
            if "|" not in col and col not in ["sample_id", "prompt", "eval_name", "oracle_model_to_route_to"]:
                # Column contains binary quality scores for that model
                self.global_averages[col] = float(self.train_df[col].mean())

    def predict_quality(
        self, query_embedding: np.ndarray, candidates: List[str]
    ) -> Tuple[Dict[str, float], List[Dict]]:
        """
        Predicts quality score for each candidate model and returns neighbor info.
        
        Args:
            query_embedding: 384-dimensional prompt embedding
            candidates: List of mock model IDs requested (e.g. ['openai/gpt-5.5'])
            
        Returns:
            Tuple of:
              - Dict mapping model_id -> predicted quality score in [0.0, 1.0]
              - List of neighbor details for explanation payload
        """
        if self.train_embeddings is None or self.train_df is None:
            raise ValueError("KNNPredictor is not loaded.")
            
        # Normalize the query embedding for cosine dot product
        query_norm = np.linalg.norm(query_embedding)
        normed_query = query_embedding / (query_norm if query_norm > 0 else 1.0)
        
        # Compute cosine similarity
        similarities = np.dot(self.train_embeddings, normed_query)
        
        # Find top k indices
        top_k_indices = np.argsort(similarities)[::-1][:self.k]
        
        # Get neighbor data
        neighbors_df = self.train_df.iloc[top_k_indices]
        neighbor_similarities = similarities[top_k_indices]
        
        # Prepare neighbor details for the explanation payload
        neighbor_details = []
        for idx, (row_idx, row) in enumerate(neighbors_df.iterrows()):
            sim = float(neighbor_similarities[idx])
            # Determine the oracle model (winner) for this neighbor prompt
            winner = str(row.get("oracle_model_to_route_to", "unknown"))
            neighbor_details.append({
                "prompt": str(row["prompt"]),
                "winner": winner,
                "sim": sim
            })
            
        # Predict quality for each candidate
        predictions = {}
        for candidate_id in candidates:
            # Map mock ID to actual dataset ID
            model_config = self.registry.get_model(candidate_id)
            if not model_config:
                # If model is completely unknown to registry, use standard default
                predictions[candidate_id] = 0.5
                continue
                
            dataset_model = model_config.dataset_model_id
            
            # Check if this model is in our training columns
            if dataset_model in neighbors_df.columns:
                # Level 1: Average scores among top-k neighbors
                neighbor_scores = neighbors_df[dataset_model].dropna().tolist()
                
                if len(neighbor_scores) > 0:
                    predictions[candidate_id] = float(np.mean(neighbor_scores))
                else:
                    # Level 2 Fallback: Global average of that model in the training set
                    predictions[candidate_id] = self.global_averages.get(dataset_model, 0.75)
            else:
                # Level 3 Fallback: Unseen model, use a default value relative to its class
                # (e.g. 0.85 for premium, 0.5 for cheap)
                if "gpt-5.5" in candidate_id or "sonnet" in candidate_id:
                    predictions[candidate_id] = 0.85
                elif "flash" in candidate_id or "mini" in candidate_id:
                    predictions[candidate_id] = 0.65
                else:
                    predictions[candidate_id] = 0.75
                    
        return predictions, neighbor_details
