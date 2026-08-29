import postgres from "postgres";
import { randomUUID, createHash } from "crypto";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(connectionString);

// ── Model registry data (must match migrations/001_init.sql seed) ──
// The migration already inserts these — this script only reads their
// prices/latency to generate realistic request rows.
const MODELS = [
  {
    id: "openai/gpt-5.5",
    display_name: "GPT-5.5",
    price_in_per_1m: 5.0,
    price_out_per_1m: 30.0,
    context_length: 1050000,
    avg_latency_ms: 2400,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    display_name: "Claude Sonnet 4.6",
    price_in_per_1m: 3.0,
    price_out_per_1m: 15.0,
    context_length: 1000000,
    avg_latency_ms: 2000,
  },
  {
    id: "google/gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    price_in_per_1m: 1.25,
    price_out_per_1m: 10.0,
    context_length: 1048576,
    avg_latency_ms: 1900,
  },
  {
    id: "deepseek/deepseek-r1",
    display_name: "DeepSeek R1",
    price_in_per_1m: 0.7,
    price_out_per_1m: 2.5,
    context_length: 64000,
    avg_latency_ms: 3400,
  },
  {
    id: "openai/gpt-5-mini",
    display_name: "GPT-5 mini",
    price_in_per_1m: 0.25,
    price_out_per_1m: 2.0,
    context_length: 400000,
    avg_latency_ms: 1300,
  },
  {
    id: "qwen/qwen3.7-flash",
    display_name: "Qwen3.7 Flash",
    price_in_per_1m: 0.03,
    price_out_per_1m: 0.13,
    context_length: 1000000,
    avg_latency_ms: 900,
  },
];

const MODEL_IDS = MODELS.map((m) => m.id);
const BASELINE_MODEL = "openai/gpt-5.5";

// ── Prompts (varied difficulty) ──────────────────────────────────
const PROMPTS: Array<{ text: string; difficulty: "easy" | "medium" | "hard" }> = [
  { text: "Translate 'hello world' to French.", difficulty: "easy" },
  { text: "Summarize the key features of React 19.", difficulty: "medium" },
  { text: "Write a Python function to find the longest palindrome in a string.", difficulty: "medium" },
  { text: "Explain CRDTs to a backend engineer.", difficulty: "medium" },
  { text: "What is 2 + 2?", difficulty: "easy" },
  { text: "Convert this JSON to YAML: {name: 'test', value: 42}", difficulty: "easy" },
  { text: "List the top 5 benefits of microservices architecture.", difficulty: "easy" },
  { text: "Design a rate limiter using a token bucket algorithm in Go.", difficulty: "hard" },
  { text: "Explain the difference between TCP and UDP with examples.", difficulty: "easy" },
  { text: "Write a SQL query to find the second highest salary in each department.", difficulty: "medium" },
  { text: "Implement a LRU cache in Python with O(1) operations.", difficulty: "medium" },
  { text: "What are the SOLID principles? Give one example each.", difficulty: "easy" },
  { text: "Explain how garbage collection works in Go vs Java.", difficulty: "medium" },
  { text: "Write a Rust function that checks if a string is a valid IPv4 address.", difficulty: "medium" },
  { text: "Compare and contrast REST and GraphQL APIs.", difficulty: "easy" },
  { text: "Design a distributed lock service like Chubby.", difficulty: "hard" },
  { text: "Explain vector clocks and their use in distributed systems.", difficulty: "hard" },
  { text: "Write a bash script to monitor disk usage and alert on threshold.", difficulty: "easy" },
  { text: "What is the CAP theorem? Give real-world examples.", difficulty: "easy" },
  { text: "Implement binary search in TypeScript.", difficulty: "easy" },
  { text: "Explain the Raft consensus algorithm step by step.", difficulty: "hard" },
  { text: "Write a regex to validate email addresses.", difficulty: "easy" },
  { text: "How does HTTPS work? Explain the TLS handshake.", difficulty: "medium" },
  { text: "Create a React hook for debouncing input.", difficulty: "medium" },
  { text: "Explain the difference between processes and threads.", difficulty: "easy" },
  { text: "Design a URL shortener like bit.ly.", difficulty: "medium" },
  { text: "Write a function to merge two sorted linked lists.", difficulty: "medium" },
  { text: "What is event sourcing? When should you use it?", difficulty: "medium" },
  { text: "Explain how Docker containers differ from VMs.", difficulty: "easy" },
  { text: "Implement a trie data structure with insert, search, and startsWith.", difficulty: "medium" },
  { text: "What are WebSockets and when would you use them over HTTP?", difficulty: "easy" },
  { text: "Design a message queue like Kafka at a high level.", difficulty: "hard" },
  { text: "Write a Python decorator that caches function results.", difficulty: "medium" },
  { text: "Explain the actor model in concurrent programming.", difficulty: "hard" },
  { text: "What is the difference between horizontal and vertical scaling?", difficulty: "easy" },
  { text: "Implement quicksort in JavaScript.", difficulty: "medium" },
  { text: "Explain database indexing and B-trees.", difficulty: "medium" },
  { text: "Write a function to detect a cycle in a linked list.", difficulty: "medium" },
  { text: "What is a bloom filter and when is it useful?", difficulty: "hard" },
  { text: "Explain OAuth 2.0 authorization code flow.", difficulty: "medium" },
  { text: "Write a function to flatten a nested array.", difficulty: "easy" },
  { text: "How does a HashMap work internally?", difficulty: "medium" },
  { text: "Design a notification system for a social media app.", difficulty: "hard" },
  { text: "Explain gRPC and Protocol Buffers.", difficulty: "medium" },
  { text: "Write a SQL query to find duplicate emails in a table.", difficulty: "easy" },
  { text: "What is eventual consistency? Give examples.", difficulty: "medium" },
  { text: "Implement a stack using two queues.", difficulty: "medium" },
  { text: "Explain how DNS resolution works.", difficulty: "easy" },
  { text: "Design an autocomplete system like Google Search.", difficulty: "hard" },
  { text: "Write a function to serialize and deserialize a binary tree.", difficulty: "hard" },
];

// ── Helpers ──────────────────────────────────────────────────────
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min: number, max: number, decimals = 4): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function pickModelForDifficulty(
  difficulty: "easy" | "medium" | "hard"
): string {
  // Easy prompts -> cheaper models more likely
  // Hard prompts -> premium models more likely
  const weights: Record<string, Record<string, number>> = {
    easy: {
      "qwen/qwen3.7-flash": 0.35,
      "openai/gpt-5-mini": 0.3,
      "deepseek/deepseek-r1": 0.15,
      "google/gemini-2.5-pro": 0.1,
      "anthropic/claude-sonnet-4.6": 0.06,
      "openai/gpt-5.5": 0.04,
    },
    medium: {
      "deepseek/deepseek-r1": 0.25,
      "anthropic/claude-sonnet-4.6": 0.25,
      "openai/gpt-5.5": 0.15,
      "google/gemini-2.5-pro": 0.15,
      "openai/gpt-5-mini": 0.15,
      "qwen/qwen3.7-flash": 0.05,
    },
    hard: {
      "openai/gpt-5.5": 0.3,
      "anthropic/claude-sonnet-4.6": 0.25,
      "google/gemini-2.5-pro": 0.2,
      "deepseek/deepseek-r1": 0.15,
      "openai/gpt-5-mini": 0.08,
      "qwen/qwen3.7-flash": 0.02,
    },
  };

  const w = weights[difficulty];
  const r = Math.random();
  let cumulative = 0;
  for (const [model, weight] of Object.entries(w)) {
    cumulative += weight;
    if (r <= cumulative) return model;
  }
  return MODEL_IDS[0];
}

function getQualityForModel(model: string, difficulty: string): number {
  // Base quality per model, adjusted by difficulty
  const baseQuality: Record<string, number> = {
    "openai/gpt-5.5": 0.95,
    "anthropic/claude-sonnet-4.6": 0.92,
    "google/gemini-2.5-pro": 0.91,
    "deepseek/deepseek-r1": 0.88,
    "openai/gpt-5-mini": 0.85,
    "qwen/qwen3.7-flash": 0.8,
  };

  const base = baseQuality[model] ?? 0.8;
  const noise = randomFloat(-0.05, 0.05);

  // Cheaper models degrade more on hard prompts
  const difficultyPenalty: Record<string, Record<string, number>> = {
    easy: {},
    medium: {
      "qwen/qwen3.7-flash": -0.08,
      "openai/gpt-5-mini": -0.04,
    },
    hard: {
      "qwen/qwen3.7-flash": -0.2,
      "openai/gpt-5-mini": -0.12,
      "deepseek/deepseek-r1": -0.06,
      "google/gemini-2.5-pro": -0.03,
    },
  };

  const penalty = difficultyPenalty[difficulty]?.[model] ?? 0;
  return Math.min(1, Math.max(0.3, base + penalty + noise));
}

function estimateTokens(
  text: string
): { inTokens: number; outTokens: number } {
  // Rough: 1 token ≈ 4 chars for English
  const inTokens = Math.ceil(text.length / 4);
  const outTokens = randomInt(
    Math.ceil(inTokens * 0.5),
    Math.ceil(inTokens * 3)
  );
  return { inTokens, outTokens };
}

function calcCost(
  model: (typeof MODELS)[number],
  inTokens: number,
  outTokens: number
): number {
  return parseFloat(
    (
      (inTokens * model.price_in_per_1m) / 1_000_000 +
      (outTokens * model.price_out_per_1m) / 1_000_000
    ).toFixed(6)
  );
}

function generateExplanation(
  prompt: string,
  chosenModel: string,
  quality: number,
  savings: number
): object {
  const neighbors = PROMPTS.filter((p) => p.text !== prompt)
    .sort(() => Math.random() - 0.5)
    .slice(0, 5)
    .map((p) => ({
      prompt: p.text,
      winner: chosenModel,
      sim: randomFloat(0.75, 0.98),
    }));

  const chosenName =
    MODELS.find((m) => m.id === chosenModel)?.display_name ?? chosenModel;

  return {
    method: "knn",
    summary: `5 similar prompts where ${chosenName} matched premium quality within ${randomInt(1, 8)}%`,
    neighbors,
    baseline_model: BASELINE_MODEL,
    est_savings_usd: parseFloat(savings.toFixed(6)),
  };
}

// ── Main seed ────────────────────────────────────────────────────
async function seed() {
  // model_registry is seeded by migrations/001_init.sql on first boot —
  // do not upsert here or we'd overwrite admin-toggled enabled flags.
  console.log("Assuming model_registry is seeded (migrations/001_init.sql)...");

  console.log("Seeding requests...");

  // Generate 200 requests spread over the last 30 days
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const requests: Array<{
    id: string;
    created_at: Date;
    prompt_hash: string;
    prompt_preview: string;
    policy_mode: string;
    lambda: number;
    chosen_model: string;
    pred_quality: number;
    est_cost_usd: number;
    actual_in_tokens: number;
    actual_out_tokens: number;
    actual_cost_usd: number;
    latency_ms: number;
    baseline_model: string;
    baseline_cost_usd: number;
    savings_usd: number;
    cache_hit: boolean;
    explanation: object;
  }> = [];

  for (let i = 0; i < 200; i++) {
    const prompt = randomChoice(PROMPTS);
    const chosenModel = pickModelForDifficulty(prompt.difficulty);
    const modelData = MODELS.find((m) => m.id === chosenModel)!;
    const baselineModelData = MODELS.find((m) => m.id === BASELINE_MODEL)!;

    const { inTokens, outTokens } = estimateTokens(prompt.text);
    const quality = getQualityForModel(chosenModel, prompt.difficulty);
    const actualCost = calcCost(modelData, inTokens, outTokens);
    const baselineCost = calcCost(baselineModelData, inTokens, outTokens);
    const savings = parseFloat((baselineCost - actualCost).toFixed(6));

    const modes = ["quality", "balanced", "cheap"] as const;
    const mode = randomChoice([...modes]);
    const lambdaMap = { quality: 0.1, balanced: 0.5, cheap: 0.9 };
    const lambda = lambdaMap[mode];

    // Timestamp spread over last 30 days
    const timestamp = new Date(
      now - Math.floor(Math.random() * thirtyDaysMs)
    );

    requests.push({
      id: randomUUID(),
      created_at: timestamp,
      prompt_hash: promptHash(prompt.text + i),
      prompt_preview: prompt.text.slice(0, 200),
      policy_mode: mode,
      lambda,
      chosen_model: chosenModel,
      pred_quality: parseFloat(quality.toFixed(4)),
      est_cost_usd: parseFloat(actualCost.toFixed(6)),
      actual_in_tokens: inTokens,
      actual_out_tokens: outTokens,
      actual_cost_usd: actualCost,
      latency_ms: modelData.avg_latency_ms
        ? modelData.avg_latency_ms + randomInt(-500, 500)
        : randomInt(1000, 4000),
      baseline_model: BASELINE_MODEL,
      baseline_cost_usd: baselineCost,
      savings_usd: savings,
      cache_hit: Math.random() < 0.12,
      explanation: generateExplanation(
        prompt.text,
        chosenModel,
        quality,
        savings
      ),
    });
  }

  // Sort by timestamp so inserts are ordered
  requests.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  // Batch insert
  for (const r of requests) {
    await sql`
      INSERT INTO requests (
        id, created_at, prompt_hash, prompt_preview, policy_mode, lambda,
        chosen_model, pred_quality, est_cost_usd,
        actual_in_tokens, actual_out_tokens, actual_cost_usd,
        latency_ms, baseline_model, baseline_cost_usd, savings_usd,
        cache_hit, explanation
      ) VALUES (
        ${r.id}, ${r.created_at}, ${r.prompt_hash}, ${r.prompt_preview},
        ${r.policy_mode}, ${r.lambda}, ${r.chosen_model},
        ${r.pred_quality}, ${r.est_cost_usd},
        ${r.actual_in_tokens}, ${r.actual_out_tokens}, ${r.actual_cost_usd},
        ${r.latency_ms}, ${r.baseline_model}, ${r.baseline_cost_usd},
        ${r.savings_usd}, ${r.cache_hit}, ${JSON.stringify(r.explanation)}::jsonb
      )
    `;
  }

  console.log(`  Inserted ${requests.length} requests.`);

  // Show summary
  const [{ count }] =
    await sql`SELECT COUNT(*)::int AS count FROM requests`;
  const [{ total_spend }] =
    await sql`SELECT COALESCE(SUM(actual_cost_usd), 0)::numeric AS total_spend FROM requests`;
  const [{ total_savings }] =
    await sql`SELECT COALESCE(SUM(savings_usd), 0)::numeric AS total_savings FROM requests`;

  console.log(`\nSeed complete:`);
  console.log(`  Total requests: ${count}`);
  console.log(`  Total spend:    $${Number(total_spend).toFixed(4)}`);
  console.log(`  Total savings:  $${Number(total_savings).toFixed(4)}`);

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
