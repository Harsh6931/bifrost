"use client";

import { useState, type FormEvent } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  isPolicyMode,
  MODE_LABEL,
  MODE_LAMBDA,
  POLICY_MODES,
  type PolicyMode,
} from "@/lib/policy";

type ChatResult = {
  chosen: string;
  content: string;
  mock: boolean;
};

export function PlaygroundForm() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PolicyMode>("balanced");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ChatResult | null>(null);

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
    setResult(null);

    try {
      const response = await fetch("/playground/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, mode }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const record =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : null;

      if (!response.ok) {
        const message =
          record && typeof record.error === "string"
            ? record.error
            : `Request failed (${response.status}).`;
        setError(message);
        return;
      }

      const chosen =
        record && typeof record.chosen === "string" ? record.chosen : "";
      const content =
        record && typeof record.content === "string" ? record.content : "";
      const mock = Boolean(record && record.mock);
      setResult({ chosen, content, mock });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route a prompt</CardTitle>
        <CardDescription>
          The browser posts here; this app’s server holds the gateway key. Mode
          sets λ (quality 0.1, balanced 0.5, cheap 0.9).
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
                    {MODE_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">λ = {MODE_LAMBDA[mode]}</p>
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Routing…" : "Submit"}
            </Button>
          </div>
        </form>
        {result ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Model · </span>
              {result.chosen}
              {result.mock ? (
                <span className="text-muted-foreground"> (mock)</span>
              ) : null}
            </p>
            <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-3 whitespace-pre-wrap text-sm">
              {result.content}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
