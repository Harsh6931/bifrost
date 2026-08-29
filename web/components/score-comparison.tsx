import type { ModelScore } from "@/lib/route-types";

function barWidth(value: number, max: number) {
  if (max <= 0) {
    return "0%";
  }
  return `${Math.max(4, Math.round((value / max) * 100))}%`;
}

function usd(value: number) {
  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }
  return `$${value.toFixed(5)}`;
}

type ScoreComparisonProps = {
  scores: ModelScore[];
  chosen: string;
};

export function ScoreComparison({ scores, chosen }: ScoreComparisonProps) {
  const maxQuality = Math.max(...scores.map((row) => row.pred_quality), 1);
  const maxCost = Math.max(...scores.map((row) => row.est_cost_usd), 1e-9);
  const maxScore = Math.max(...scores.map((row) => row.score), 1e-9);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        Candidates
      </p>
      <ul className="space-y-3">
        {scores.map((row) => {
          const selected = row.model === chosen;
          return (
            <li
              key={row.model}
              className={selected ? "rounded-lg ring-1 ring-foreground/15 p-2" : "p-2"}
            >
              <p className="mb-1 font-mono text-xs">
                {row.model}
                {selected ? " · chosen" : ""}
              </p>
              <Bar label="quality" width={barWidth(row.pred_quality, maxQuality)} />
              <Bar label={`cost ${usd(row.est_cost_usd)}`} width={barWidth(row.est_cost_usd, maxCost)} muted />
              <Bar label={`score ${row.score.toFixed(2)}`} width={barWidth(row.score, maxScore)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Bar({
  label,
  width,
  muted = false,
}: {
  label: string;
  width: string;
  muted?: boolean;
}) {
  return (
    <div className="mb-1">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={muted ? "bg-muted-foreground/50 h-full" : "bg-primary h-full"}
          style={{ width }}
        />
      </div>
    </div>
  );
}
