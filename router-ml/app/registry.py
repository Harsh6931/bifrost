import json
from pathlib import Path
from typing import Dict, List, Optional
from pydantic import BaseModel

class ModelConfig(BaseModel):
    id: str
    dataset_model_id: str  # Maps the mock ID to the actual model ID in the dataset
    display_name: str
    price_in_per_1m: float
    price_out_per_1m: float
    context_length: int
    avg_latency_ms: Optional[int] = None
    enabled: bool = True

class ModelRegistry:
    def __init__(self, registry_path: Optional[Path] = None):
        if registry_path is None:
            # Default to the same folder as this file
            current_dir = Path(__file__).parent
            self.registry_path = current_dir / "models_registry.json"
        else:
            self.registry_path = registry_path
        self.models: Dict[str, ModelConfig] = {}
        self.load()

    def load(self) -> None:
        """Loads the registry from the JSON file."""
        if not self.registry_path.exists():
            raise FileNotFoundError(f"Model registry file not found at {self.registry_path}")
        
        with open(self.registry_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        self.models = {}
        for item in data:
            model = ModelConfig(**item)
            self.models[model.id] = model

    def get_model(self, model_id: str) -> Optional[ModelConfig]:
        """Returns model config for the given ID if it exists."""
        return self.models.get(model_id)

    def list_active_models(self) -> List[ModelConfig]:
        """Lists all active (enabled) models in the registry."""
        return [m for m in self.models.values() if m.enabled]
