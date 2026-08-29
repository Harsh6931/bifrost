"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clampLambda,
  MODE_LAMBDA,
  nearestMode,
  type PolicyMode,
} from "@/lib/policy";
import { parseSseBlock } from "@/lib/playground-sse";
import type { PreviewResult } from "@/lib/route-types";

export type ChatTurn = {
  id: string;
  prompt: string;
  content: string;
  chosen: string;
  mock: boolean;
  preview: PreviewResult | null;
};

export function usePlaygroundChat() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PolicyMode>("balanced");
  const [lambda, setLambda] = useState(MODE_LAMBDA.balanced);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const streamAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewPending(true);
      try {
        const response = await fetch("/playground/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, lambda, mode }),
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== "object") {
          return;
        }
        const record = payload as PreviewResult;
        if (typeof record.chosen === "string" && Array.isArray(record.scores)) {
          setPreview(record);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
      } finally {
        setPreviewPending(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [prompt, lambda, mode]);

  const setLambdaFromSlider = useCallback((value: number | readonly number[]) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const next = clampLambda(Number(raw) / 100);
    setLambda(next);
    setMode(nearestMode(next));
  }, []);

  const reset = useCallback(() => {
    streamAbort.current?.abort();
    setPrompt("");
    setError(null);
    setPending(false);
    setTurns([]);
    setPreview(null);
  }, []);

  const loadTurns = useCallback((next: ChatTurn[]) => {
    streamAbort.current?.abort();
    setPrompt("");
    setError(null);
    setPending(false);
    setTurns(next);
    setPreview(null);
  }, []);

  const send = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Enter a prompt.");
      return;
    }

    setError(null);
    setPending(true);
    streamAbort.current?.abort();
    const controller = new AbortController();
    streamAbort.current = controller;

    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot = preview;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        prompt: trimmed,
        content: "",
        chosen: snapshot?.chosen ?? "",
        mock: Boolean(snapshot?.mock),
        preview: snapshot,
      },
    ]);
    setPrompt("");

    const patchTurn = (partial: Partial<ChatTurn>) => {
      setTurns((prev) =>
        prev.map((turn) => (turn.id === turnId ? { ...turn, ...partial } : turn)),
      );
    };

    try {
      const response = await fetch("/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, mode, lambda }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const payload: unknown = await response.json().catch(() => null);
        const record =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : null;
        const message =
          record && typeof record.error === "string"
            ? record.error
            : `Request failed (${response.status}).`;
        setError(message);
        setTurns((prev) => prev.filter((turn) => turn.id !== turnId));
        return;
      }

      if (!response.ok || !response.body) {
        setError(`Request failed (${response.status}).`);
        setTurns((prev) => prev.filter((turn) => turn.id !== turnId));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chosen = snapshot?.chosen ?? "";
      let mock = Boolean(snapshot?.mock);
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const event = parseSseBlock(part);
          if (!event) {
            continue;
          }
          if (event.type === "meta") {
            chosen = event.chosen;
            mock = event.mock;
            patchTurn({ chosen, mock, content });
          } else if (event.type === "delta") {
            content += event.content;
            patchTurn({ chosen, mock, content });
          } else if (event.type === "error") {
            setError(event.error);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }, [prompt, mode, lambda, preview]);

  return {
    prompt,
    setPrompt,
    mode,
    lambda,
    setLambdaFromSlider,
    error,
    pending,
    turns,
    preview,
    previewPending,
    send,
    reset,
    loadTurns,
  };
}
