# Bifrost ML Router (Python Microservice)

This is the machine learning routing engine of Bifrost. It dynamically routes user prompts to the most cost-effective LLM candidate based on semantic similarity, predicted quality, and policy constraints ($\lambda$-mode cost-quality optimization).

---

## 🚀 Quick Start (E2E Setup)

All commands should be executed from the `router-ml/` directory.

### 1. Initialize Virtual Environment & Install Dependencies
```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 2. Download and Split the Dataset (RouterBench)
Downloads Martian's `withmartian/routerbench` dataset (0-shot LLM quality benchmarks) and splits it into training, validation, and testing sets while preventing prompt leakage.
```powershell
python training/prepare_data.py
```

### 3. Build the Vector Search Index
Embeds the training prompts using the local `BAAI/bge-small-en-v1.5` model on CPU. Supports incremental checkpointing so progress is never lost if interrupted.
```powershell
python training/train.py
```

### 4. Run Evaluation Suite
Performs E2E routing simulation on the test set and outputs baseline comparisons against Always Premium, Always Cheap, and Random routing.
```powershell
python training/evaluate.py
```

### 5. Start the FastAPI API Server
```powershell
uvicorn app.main:app --reload --port 8000
```
The server will start at `http://127.0.0.1:8000`.

---

## 📊 Live Evaluation Results (Test Set)

Below is the E2E simulation report generated over 200 unseen test prompts, comparing our ML Router policies against static baselines:

| Mode | Average Quality | Average Cost (USD) | Cost Savings (%) | Quality Retention (%) |
| :--- | :---: | :---: | :---: | :---: |
| **Always Premium** (GPT-5.5) | **0.795** | \$0.003518 | 0.00% | 100.00% |
| **router_quality** ($\lambda=0.1$) | **0.663** | \$0.000795 | **77.41%** | **83.33%** |
| **router_balanced** ($\lambda=0.5$) | **0.561** | \$0.000172 | **95.10%** | **70.60%** |
| **router_cheap** ($\lambda=0.9$) | **0.511** | \$0.000106 | **96.99%** | **64.31%** |
| **Random Baseline** | 0.644 | \$0.001122 | 68.11% | 80.97% |
| **Always Cheap** (Qwen 3.7 Flash) | 0.296 | **\$0.000046** | 98.69% | 37.26% |

> [!TIP]
> **Key Demo Takeaways**:
> - **balanced mode** achieves a massive **95.10% cost reduction** compared to GPT-5.5 while retaining **70.6% of the quality**.
> - **always cheap** baseline has a devastating quality drop (retaining only **37%** quality). The ML Router prevents this drop by smart-routing queries that demand complex reasoning to premium models!

---

## 🔌 API Endpoints

### 1. Health Check
`GET /health`
* **Response**:
```json
{
  "status": "ok",
  "embedding_model": "BAAI/bge-small-en-v1.5",
  "predictor": "knn",
  "corpus_loaded": true,
  "registry_count": 6
}
```

### 2. Prompt Routing
`POST /route`
* **Request Payload**:
```json
{
  "prompt": "explain vector clocks to a distributed systems junior dev",
  "candidates": ["openai/gpt-5.5", "openai/gpt-5-mini", "qwen/qwen3.7-flash"],
  "policy": {
    "mode": "balanced",
    "lambda": 0.5,
    "max_cost_usd": 0.01
  }
}
```
* **Response Payload**:
```json
{
  "chosen": "openai/gpt-5-mini",
  "scores": [
    { "model": "openai/gpt-5-mini", "pred_quality": 0.72, "est_cost_usd": 0.000045, "est_latency_ms": 1200, "score": 0.72 },
    { "model": "qwen/qwen3.7-flash", "pred_quality": 0.45, "est_cost_usd": 0.000018, "est_latency_ms": 800, "score": 0.45 },
    { "model": "openai/gpt-5.5", "pred_quality": 0.95, "est_cost_usd": 0.001350, "est_latency_ms": 3200, "score": -0.05 }
  ],
  "explanation": {
    "method": "knn",
    "summary": "Routed to GPT-5 Mini because across 10 similar prompts in our dataset, it delivered comparable quality to GPT-5.5 at 1/30th of the cost.",
    "neighbors": [
      { "prompt": "explain vector databases simply", "winner": "openai/gpt-5-mini", "sim": 0.92 },
      { "prompt": "what is replication lag?", "winner": "openai/gpt-5-mini", "sim": 0.89 }
    ],
    "baseline_model": "openai/gpt-5.5",
    "est_savings_usd": 0.001305
  },
  "timing_ms": {
    "embed": 4.12,
    "predict": 1.85
  }
}
```

---

## 🎓 How to Explain in a Viva (College Q&A Prep)

### Q1: What is the core ML technique used for prompt routing?
**Answer:** We use **k-Nearest Neighbors (k-NN) vector search** combined with a local text embedding model (**BGE-small-en-v1.5**). When a prompt comes in, we convert it to a 384-dimensional vector, find the top $k=10$ semantically closest prompts from our offline benchmark index, and average the historical model performances on those neighbors to predict quality scores for the current prompt.

### Q2: Why choose k-NN instead of neural networks or tree-based classifiers (e.g. LightGBM)?
**Answer:** 
1. **Zero-Overhead Registry Updates**: In LLM systems, models are added or retired frequently. If we used a classifier neural network, we would have to retrain the network from scratch every time a model is updated. With k-NN (which is a lazy learner), we simply add or modify model performance scores in our reference DataFrame (`train_metadata.csv`), and the router adapts instantly without retraining.
2. **Direct Explainability**: We can extract the actual neighboring prompts that are semantically closest and return them in the API payload, showing the user exactly why the router chose a specific model.

### Q3: What is the math behind the routing decision?
**Answer:** We optimize a multi-objective utility function balancing predicted quality and normalized cost:
1. **Quality Prediction $\hat{q}(m)$**: The average binary quality score of model $m$ over the retrieved top-$k$ nearest neighbors:
   $$\hat{q}(m) = \frac{1}{k} \sum_{i \in N_k} q(m, n_i)$$
2. **Cost Normalization $c_{\text{norm}}(m)$**: To ensure costs are comparable across different scales, we apply min-max scaling among the available candidates for that specific request:
   $$c_{\text{norm}}(m) = \frac{\text{cost}(m) - \min(\text{costs})}{\max(\text{costs}) - \min(\text{costs}) + \epsilon}$$
3. **Utility Scoring**: We calculate a composite score using the policy multiplier $\lambda$:
   $$\text{score}(m) = \hat{q}(m) - \lambda \cdot c_{\text{norm}}(m)$$
4. **Decision**: The model with the highest composite score is chosen:
   $$\text{chosen} = \arg\max_{m} (\text{score}(m))$$

### Q4: How does the router handle missing performance data for a model?
**Answer:** We implement a **three-tier hierarchical safety fallback**:
* **Level 1 (Local Neighbors)**: Average the performance of the model on the top-$k$ closest prompts.
* **Level 2 (Global Corpus)**: If the model has no scores in the neighborhood, fall back to its global average performance across the entire training dataset.
* **Level 3 (Registry Default)**: If the model is completely unseen or new, use registry default quality ratings based on its model class (e.g. Premium = 0.85, Cheap = 0.65).

### Q5: What is the role of the registry JSON?
**Answer:** The `models_registry.json` serves as the single source of truth for pricing (input/output per 1M tokens), context length limits, and mapping mock IDs (like `openai/gpt-5.5`) to real-world dataset IDs (like `gpt-4-1106-preview`). This decouples the Python ML microservice from SQL lookups and PostgreSQL overhead, ensuring sub-10ms response latencies.
