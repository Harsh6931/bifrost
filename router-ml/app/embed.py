import numpy as np
from typing import List
from fastembed import TextEmbedding

class EmbeddingModel:
    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        self.model_name = model_name
        # TextEmbedding downloads the model on first initialization (cached locally)
        # It runs ONNX under the hood and is thread-safe.
        self.model = TextEmbedding(model_name=self.model_name)

    def embed_prompt(self, prompt: str) -> np.ndarray:
        """Embeds a single prompt and returns a 384-dimensional numpy array."""
        embeddings = list(self.model.embed([prompt]))
        return embeddings[0]

    def embed_prompts(self, prompts: List[str]) -> np.ndarray:
        """Embeds a list of prompts and returns a numpy matrix of shape (N, 384)."""
        embeddings = list(self.model.embed(prompts))
        return np.vstack(embeddings)
