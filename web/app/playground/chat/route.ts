import { NextResponse } from "next/server";

import { clampLambda, isPolicyMode, MODE_LAMBDA } from "@/lib/policy";
import {
  chunkText,
  encodeSse,
  type ChatStreamEvent,
} from "@/lib/playground-sse";

const MOCK_MODEL = "qwen/qwen3.7-flash";

type ChatRequestBody = {
  prompt?: unknown;
  mode?: unknown;
  lambda?: unknown;
};

function mockText(prompt: string, mode: string, lambda: number) {
  return [
    `[mock · ${MOCK_MODEL}]`,
    `Mode: ${mode} (λ ${lambda.toFixed(2)}).`,
    "Streaming a fake reply. Set BIFROST_MOCK=0 when the gateway streams.",
    "",
    `Echo: ${prompt.slice(0, 280)}`,
  ].join("\n");
}

function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function pushEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: ChatStreamEvent,
) {
  controller.enqueue(encoder.encode(encodeSse(event)));
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
  const lambda =
    typeof body.lambda === "number" ? clampLambda(body.lambda) : MODE_LAMBDA[mode];
  const useMock = process.env.BIFROST_MOCK !== "0";
  const encoder = new TextEncoder();

  if (useMock) {
    const text = mockText(prompt, mode, lambda);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        pushEvent(controller, encoder, {
          type: "meta",
          chosen: MOCK_MODEL,
          mock: true,
        });
        for (const chunk of chunkText(text)) {
          pushEvent(controller, encoder, { type: "delta", content: chunk });
          await new Promise((resolve) => setTimeout(resolve, 18));
        }
        pushEvent(controller, encoder, { type: "done" });
        controller.close();
      },
    });
    return sseResponse(stream);
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
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gateway request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  if (!upstream.ok) {
    const raw: unknown = await upstream.json().catch(() => null);
    const detail =
      raw &&
        typeof raw === "object" &&
        "error" in raw &&
        typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : `Gateway returned ${upstream.status}.`;
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  if (contentType.includes("text/event-stream") && upstream.body) {
    return sseResponse(relayOpenAiStream(upstream.body, encoder));
  }

  const raw: unknown = await upstream.json().catch(() => null);
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chosen =
    typeof record.model === "string" && record.model.length > 0
      ? record.model
      : "unknown";
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    first && typeof first.message === "object" && first.message !== null
      ? (first.message as Record<string, unknown>)
      : null;
  const content =
    message && typeof message.content === "string" ? message.content : "";

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      pushEvent(controller, encoder, { type: "meta", chosen, mock: false });
      if (content) {
        pushEvent(controller, encoder, { type: "delta", content });
      }
      pushEvent(controller, encoder, { type: "done" });
      controller.close();
    },
  });
  return sseResponse(stream);
}

function relayOpenAiStream(
  body: ReadableStream<Uint8Array>,
  encoder: TextEncoder,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sentMeta = false;

      const send = (event: ChatStreamEvent) => {
        pushEvent(controller, encoder, event);
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part
              .split("\n")
              .map((row) => row.trimEnd())
              .find((row) => row.startsWith("data:"));
            if (!line) {
              continue;
            }
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") {
              continue;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }
            if (!parsed || typeof parsed !== "object") {
              continue;
            }
            const record = parsed as Record<string, unknown>;
            if (!sentMeta && typeof record.model === "string" && record.model) {
              send({ type: "meta", chosen: record.model, mock: false });
              sentMeta = true;
            }
            const choices = Array.isArray(record.choices) ? record.choices : [];
            const first =
              choices[0] && typeof choices[0] === "object"
                ? (choices[0] as Record<string, unknown>)
                : null;
            const delta =
              first && typeof first.delta === "object" && first.delta !== null
                ? (first.delta as Record<string, unknown>)
                : null;
            const token = delta && typeof delta.content === "string" ? delta.content : "";
            if (token) {
              send({ type: "delta", content: token });
            }
          }
        }
        if (!sentMeta) {
          send({ type: "meta", chosen: "unknown", mock: false });
        }
        send({ type: "done" });
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream failed.";
        send({ type: "error", error: message });
        controller.close();
      }
    },
  });
}
