"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ExplanationPanel } from "@/components/explanation-panel";
import { ModelBadge } from "@/components/model-badge";
import { ScoreComparison } from "@/components/score-comparison";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  clampLambda,
  isPolicyMode,
  MODE_LAMBDA,
  nearestMode,
  POLICY_MODES,
  type PolicyMode,
} from "@/lib/policy";
import type { PreviewResult } from "@/lib/route-types";
import { parseSseBlock } from "@/lib/playground-sse";

type ChatResult = {
  chosen: string;
  content: string;
  mock: boolean;
};

export function PlaygroundForm() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PolicyMode>("balanced");
  const [lambda, setLambda] = useState(MODE_LAMBDA.balanced);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ChatResult | null>(null);
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

  function setLambdaFromSlider(value: number | readonly number[]) {
    const raw = Array.isArray(value) ? value[0] : value;
    const next = clampLambda(Number(raw) / 100);
    setLambda(next);
    setMode(nearestMode(next));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Enter a prompt.");
      setResult(null);
      return;
    }

    setError(null);
    setPending(true);
    streamAbort.current?.abort();
    const controller = new AbortController();
    streamAbort.current = controller;
    setResult({
      chosen: preview?.chosen ?? "",
      content: "",
      mock: Boolean(preview?.mock),
    });

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
        setResult(null);
        return;
      }

      if (!response.ok || !response.body) {
        setError(`Request failed (${response.status}).`);
        setResult(null);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chosen = preview?.chosen ?? "";
      let mock = Boolean(preview?.mock);
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
            setResult({ chosen, content, mock });
          } else if (event.type === "delta") {
            content += event.content;
            setResult({ chosen, content, mock });
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
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Route a prompt</CardTitle>
          <CardDescription>
            Drag λ to watch the decision flip. Preview does not call a model.
            Submit streams the reply into the box below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                name="prompt"
                rows={6}
                placeholder="explain CRDTs to a backend engineer"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mode">Mode</Label>
              <Select
                value={mode}
                onValueChange={(value) => {
                  if (isPolicyMode(value)) {
                    setMode(value);
                    setLambda(MODE_LAMBDA[value]);
                  }
                }}
                disabled={pending}
              >
                <SelectTrigger id="mode" className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_MODES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lambda">
                λ · {lambda.toFixed(2)} ({mode})
              </Label>
              <Slider
                id="lambda"
                min={0}
                max={100}
                step={1}
                value={[Math.round(lambda * 100)]}
                onValueChange={setLambdaFromSlider}
                disabled={pending}
              />
              <p className="text-muted-foreground text-xs">
                0 = quality first · 1 = cost first. Preview updates live.
                {previewPending ? " Updating…" : ""}
              </p>
            </div>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Streaming…" : "Submit"}
              </Button>
            </div>
          </form>
          {result ? (
            <div className="mt-4 space-y-2">
              <ModelBadge model={result.chosen} mock={result.mock} />
              <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-3 whitespace-pre-wrap text-sm">
                {result.content}
                {pending ? "▍" : ""}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Why this model</CardTitle>
          <CardDescription>
            Live preview from k-NN-style scores. No tokens billed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {preview ? (
            <>
              <ExplanationPanel
                chosen={preview.chosen}
                mock={preview.mock}
                explanation={preview.explanation}
              />
              <ScoreComparison scores={preview.scores} chosen={preview.chosen} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Type a prompt to see the routing decision, neighbors, and scores.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
