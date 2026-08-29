import { NextResponse } from "next/server";

import { isPolicyMode, MODE_LAMBDA } from "@/lib/policy";

const MOCK_MODEL = "qwen/qwen3.7-flash";

type ChatRequestBody = {
  prompt?: unknown;
  mode?: unknown;
};

function mockCompletion(prompt: string, mode: string) {
  const content = [
    `[mock · ${MOCK_MODEL}]`,
    `Mode: ${mode} (λ ${MODE_LAMBDA[mode as keyof typeof MODE_LAMBDA]}).`,
    "Gateway is not in this request. Set BIFROST_MOCK=0 in web/.env.local when /v1/chat/completions is up.",
    "",
    `Echo: ${prompt.slice(0, 280)}`,
  ].join("\n");

  return {
    chosen: MOCK_MODEL,
    content,
    mock: true,
  };
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Enter a prompt." }, { status: 400 });
  }
  if (!isPolicyMode(body.mode)) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }

  const mode = body.mode;
  const lambda = MODE_LAMBDA[mode];
  const useMock = process.env.BIFROST_MOCK !== "0";

  if (useMock) {
    return NextResponse.json(mockCompletion(prompt, mode));
  }

  const gatewayUrl = process.env.GATEWAY_URL;
  const apiKey = process.env.BIFROST_API_KEY;
  if (!gatewayUrl || !apiKey) {
    return NextResponse.json(
      { error: "GATEWAY_URL and BIFROST_API_KEY must be set." },
      { status: 500 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${gatewayUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Bifrost-Mode": mode,
        "X-Bifrost-Lambda": String(lambda),
      },
      body: JSON.stringify({
        model: "unused",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gateway request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const raw: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const detail =
      raw &&
      typeof raw === "object" &&
      "error" in raw &&
      typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : `Gateway returned ${upstream.status}.`;
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chosen =
    typeof record.model === "string" && record.model.length > 0
      ? record.model
      : "unknown";
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>)
    : null;
  const message =
    first && typeof first.message === "object" && first.message !== null
      ? (first.message as Record<string, unknown>)
      : null;
  const content =
    message && typeof message.content === "string" ? message.content : "";

  return NextResponse.json({
    chosen,
    content,
    mock: false,
  });
}
