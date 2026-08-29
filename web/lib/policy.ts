export const POLICY_MODES = ["quality", "balanced", "cheap"] as const;

export type PolicyMode = (typeof POLICY_MODES)[number];

export const MODE_LAMBDA: Record<PolicyMode, number> = {
  quality: 0.1,
  balanced: 0.5,
  cheap: 0.9,
};

export const MODE_LABEL: Record<PolicyMode, string> = {
  quality: "Quality — prefer premium models",
  balanced: "Balanced — default tradeoff",
  cheap: "Cheap — downgrade unless it needs power",
};

export function isPolicyMode(value: unknown): value is PolicyMode {
  return (
    typeof value === "string" &&
    (POLICY_MODES as readonly string[]).includes(value)
  );
}

export function clampLambda(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

export function nearestMode(lambda: number): PolicyMode {
  const value = clampLambda(lambda);
  if (value < 0.3) {
    return "quality";
  }
  if (value < 0.7) {
    return "balanced";
  }
  return "cheap";
}

