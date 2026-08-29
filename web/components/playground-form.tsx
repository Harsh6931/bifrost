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

const POLICY_MODES = ["quality", "balanced", "cheap"] as const;

type PolicyMode = (typeof POLICY_MODES)[number];

const MODE_LAMBDA: Record<PolicyMode, number> = {
  quality: 0.1,
  balanced: 0.5,
  cheap: 0.9,
};

const MODE_LABEL: Record<PolicyMode, string> = {
  quality: "Quality — prefer premium models",
  balanced: "Balanced — default tradeoff",
  cheap: "Cheap — downgrade unless it needs power",
};

export function PlaygroundForm() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PolicyMode>("balanced");
  const [error, setError] = useState<string | null>(null);
  const [lastSubmit, setLastSubmit] = useState<{
    prompt: string;
    mode: PolicyMode;
  } | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Enter a prompt.");
      setLastSubmit(null);
      return;
    }
    setError(null);
    setLastSubmit({ prompt: trimmed, mode });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Route a prompt</CardTitle>
        <CardDescription>
          Mode sets λ (quality 0.1, balanced 0.5, cheap 0.9). Dispatch comes in
          the next step.
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
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mode">Mode</Label>
            <Select
              value={mode}
              onValueChange={(value) => {
                if (
                  value === "quality" ||
                  value === "balanced" ||
                  value === "cheap"
                ) {
                  setMode(value);
                }
              }}
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
            <Button type="submit">Submit</Button>
          </div>
        </form>
        {lastSubmit ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Ready to send ({lastSubmit.mode}, λ {MODE_LAMBDA[lastSubmit.mode]}).
            Chat proxy is next.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
