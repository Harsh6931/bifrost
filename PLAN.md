# Bifrost — Internal Build Plan

> Private working doc. Not committed. Companion to `PRD.md`, which holds the public
> problem statement, architecture, schema, and API contracts.

---

## 6. Phases

Estimates assume a ~36-hour hackathon. Adjust the multiplier, keep the ordering — it's dependency-driven.

### Phase 0 — Foundation · ~3h

The one phase that has to happen together. Ends when every component can be built without coordination.

- [x] Agree on the `/route` request + response JSON, paste it into `packages/types`
- [x] Create monorepo skeleton with all four directories
- [x] `docker-compose.yml` with Postgres; confirm all four can connect
- [x] Write `migrations/001_init.sql` from §5.6, apply it
- [x] Seed `model_registry` with 5–6 models and *current* prices from OpenRouter
- [x] Create OpenRouter account, get key, verify with one curl, put $10 on it
- [x] Shared `.env.example`; agree on ports (8080 / 8000 / 3000)
- [x] Each service returns `200 {"status":"ok"}` on `/health`
- [x] Push to GitHub, branch protection off, agree on branch naming

**Exit:** all services boot, DB has tables and seeded models, the contract is agreed.

### Phase 1 — Vertical slice · ~9h

Build the dumbest possible version of everything, end to end. **No intelligence yet.** Nobody optimizes their component until a prompt can travel the whole path and come back.

**Gateway**
- [x] axum server, `/health`, tracing subscriber, config from env
- [x] `POST /v1/chat/completions` accepting OpenAI's request schema
- [x] Bearer token check against a static env var
- [x] `LlmProvider` trait + OpenRouter impl (non-streaming first)
- [x] Call ML `/route`, use `chosen` to pick the model, dispatch
- [x] Return an OpenAI-shaped response body
- [x] Insert a `requests` row with actual tokens, cost, latency
- [x] **Verify: `openai` Python SDK works against it with only `base_url` changed**

**Router ML**
- [x] FastAPI skeleton, `/health`, `/route` matching the contract
- [x] Stub `/route`: return cheapest enabled model, `pred_quality: 0.5`, fake explanation
- [x] Download RouterBench, open it in a notebook, document the real schema
- [x] Write the loader → normalized `(prompt, model, quality, cost)` table
- [x] Get `fastembed` running, embed 100 prompts, confirm shape and timing

**Playground**
- [x] Next.js app, Tailwind, shadcn init, layout shell + nav
- [x] Playground page: prompt box, mode selector, submit
- [x] API route proxying to the gateway (browser never holds the key)
- [x] Render the response + chosen model badge

**Dashboard**
- [x] DB client + typed queries against `requests`
- [x] `/api/stats` returning totals: requests, spend, savings, model mix
- [x] Dashboard page with four stat tiles wired to real data
- [x] Seed script writing ~200 fake `requests` rows so the UI has something to show

**Exit:** prompt goes in the playground, comes back answered, appears in the dashboard. Ugly is fine.

### Phase 2 — Real intelligence · ~12h

Now make it actually route.

**Router ML** (heaviest workstream this phase)
- [x] Embed the full corpus, persist as `.npy` + id index
- [x] Implement k-NN: cosine over the in-memory matrix, top-k, per-model quality average
- [x] Load prices from `model_registry`, implement `cost(m)`
- [x] Token estimator for `est_in_tok` / `est_out_tok` (tiktoken is fine)
- [x] Implement the §5.3 composite score with λ and hard filters
- [x] Build the `explanation` payload with real neighbor prompts + the summary sentence
- [x] Replace the stub `/route` with the real path; confirm < 50ms
- [x] Held-out eval: cost reduction % and quality retention % vs. always-premium
- [x] **Write those two numbers down — they go on the demo slide**

**Gateway**
- [ ] SSE streaming passthrough from OpenRouter to client
- [ ] Exact-match response cache (hash prompt+policy), record `cache_hit`
- [ ] Compute and store `baseline_cost_usd` + `savings_usd` per request
- [x] `POST /v1/route/preview` — decide without dispatching
- [ ] `GET /v1/route/explain?request_id=`
- [x] Graceful degradation: if the ML service is down, route to a default model and log it
- [x] Structured request logging

**Playground**
- [x] Explanation panel: chosen model, why, neighbor prompts, savings on this call
- [x] λ slider calling `/v1/route/preview` on change — decision updates live, no spend
- [x] Score comparison view: all candidates with quality/cost/score bars
- [x] Streaming response rendering

Frontend 1 notes: proxy lives at `POST /playground/preview` (and chat at `POST /playground/chat`) so the browser never holds keys. Live λ / explain / scores work against a mock while `BIFROST_MOCK=1`; they will hit gateway `POST /v1/route/preview` when that exists and mock is off. Streaming is still open.

**Dashboard**
- [x] Cumulative savings chart (Bifrost vs. always-premium) over time
- [x] Model distribution chart
- [x] Cost/quality scatter, one point per request
- [x] Request log table: prompt preview, model, cost, saved, latency; row → explanation
- [x] Model registry admin page (toggle enabled, edit prices)

**Exit:** routing is real and measurably saves money; the dashboard proves it with real traffic.

### Phase 3 — Polish & demo · ~9h

- [ ] Deploy gateway → Fly.io
- [ ] Deploy ML service → Fly.io
- [ ] Deploy web → Vercel
- [ ] Point all three at Neon; verify prod end to end
- [ ] Landing page: one-line pitch, the base_url code snippet, live savings counter
- [ ] Empty states, loading skeletons, error toasts
- [ ] Mobile-check the dashboard (judges use phones)
- [ ] Refresh `model_registry` prices the night before
- [ ] **Replay mode:** replay logged request/response pairs if the network dies on stage
- [ ] Pre-warm the cache with the exact demo prompts
- [x] README with architecture diagram + setup
- [ ] Write and rehearse the 3-minute script below, twice, timed

**Demo script**
1. *(20s)* Here's a normal OpenAI script. Change one line. Same code, same output.
2. *(40s)* Playground: an easy prompt → routes cheap. A hard prompt → routes premium. Same router.
3. *(40s)* Drag the λ slider. Watch the decision flip live from GPT-4o to DeepSeek.
4. *(40s)* Click "why" — here are 5 similar prompts where the cheap model matched the expensive one.
5. *(40s)* Dashboard: 200 real requests, X% cheaper, Y% quality retained.

### Phase 4 — Stretch · only if Phase 3 is fully done

- [ ] LightGBM predictor replacing k-NN for the decision (keep k-NN as explainer)
- [ ] Cascade: run cheap first, self-judge, escalate on low confidence
- [ ] Semantic cache — serve near-duplicate prompts from cache above a similarity threshold
- [ ] Port embedding + k-NN into the Rust binary via `fastembed-rs`, drop the hop
- [ ] Per-key budgets with hard cutoff
- [ ] Online learning from thumbs-up/down in the playground

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| RouterBench schema isn't what we expect | High — blocks Phase 2 | Open it in a notebook during **Phase 1**, not Phase 2. Fallback: LLM-as-judge on ~500 prompts. |
| Router picks cheap models that visibly fail on stage | Fatal | Rehearse with the exact demo prompts. Tune λ. Cache the demo path. |
| Live API flakiness during the demo | Fatal | Replay mode + pre-warmed cache. Build it, don't hope. |
| Router ML becomes the bottleneck in Phase 2 | High | Stub `/route` ships in Phase 1 so nothing waits on it. Shift help onto the eval script if it slips. |
| Integration hell at hour 30 | High | The Phase 1 vertical slice exists precisely to force integration early. |
| Time sunk into auth / multi-tenancy | Medium | Explicitly out of scope. One static bearer token. |

## 8. Open decisions

- [ ] Hackathon duration and hard demo deadline → set the phase multiplier
- [ ] Premium baseline model for savings math (must be one fixed model — pick it in Phase 0)
- [ ] Candidate set: how many models in the registry? 5–6 is the sweet spot; more dilutes the story
- [ ] Live API calls on stage vs. replay-only — build both, decide at hour 30

## 9. Notes

The model names in the original pitch (GPT-4o, Gemini 1.5 Pro, Claude 3) are a generation or two behind. It doesn't affect the architecture — but keep the candidate set in `model_registry`, never hardcoded in an enum. Refreshing the lineup should be an `UPDATE`, not a redeploy. That's the "model-agnostic" feature, and it's five minutes of work.
