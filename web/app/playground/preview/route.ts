import { NextResponse } from "next/server";

import { mockPreview } from "@/lib/mock-preview";
import { clampLambda, isPolicyMode, MODE_LAMBDA } from "@/lib/policy";
import type { PreviewResult, RouteResponse } from "@/lib/route-types";

type PreviewBody = {
  prompt?: unknown;
  lambda?: unknown;
  mode?: unknown;
};

function asRouteResponse(raw: unknown): RouteResponse | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.chosen !== "string") {
    return null;
  }
  return raw as RouteResponse;
}

export async function POST(request: Request) {
  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Enter a prompt." }, { status: 400 });
  }

  const lambda =
    typeof body.lambda === "number"
      ? clampLambda(body.lambda)
      : isPolicyMode(body.mode)
        ? MODE_LAMBDA[body.mode]
        : 0.5;

  const useMock = process.env.BIFROST_MOCK !== "0";
  if (useMock) {
    const result: PreviewResult = { ...mockPreview(prompt, lambda), mock: true };
    return NextResponse.json(result);
  }

  const gatewayUrl = process.env.GATEWAY_URL;
  const apiKey = process.env.BIFROST_API_KEY;
  if (!gatewayUrl || !apiKey) {
    return NextResponse.json(
      { error: "GATEWAY_URL and BIFROST_API_KEY must be set." },
      { status: 500 },
    );
  }

  const mode = isPolicyMode(body.mode)
    ? body.mode
    : lambda < 0.3
      ? "quality"
      : lambda < 0.7
        ? "balanced"
        : "cheap";

  let upstream: Response;
  try {
    upstream = await fetch(`${gatewayUrl.replace(/\/$/, "")}/v1/route/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        policy: { mode, lambda, max_cost_usd: 0.05 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const raw: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Gateway preview returned ${upstream.status}.` },
      { status: 502 },
    );
  }

  const parsed = asRouteResponse(raw);
  if (!parsed) {
    return NextResponse.json(
      { error: "Gateway preview payload was invalid." },
      { status: 502 },
    );
  }

  const result: PreviewResult = { ...parsed, mock: false };
  return NextResponse.json(result);
}
