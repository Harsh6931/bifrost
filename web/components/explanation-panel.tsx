import { ModelBadge } from "@/components/model-badge";
import type { Explanation } from "@/lib/route-types";

function usd(value: number) {
  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }
  return `$${value.toFixed(5)}`;
}

type ExplanationPanelProps = {
  chosen: string;
  mock?: boolean;
  explanation: Explanation;
};

export function ExplanationPanel({
  chosen,
  mock = false,
  explanation,
}: ExplanationPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ModelBadge model={chosen} mock={mock} />
        <span className="text-muted-foreground text-xs">
          save {usd(explanation.est_savings_usd)} vs {explanation.baseline_model}
        </span>
      </div>
      <p className="text-sm">{explanation.summary}</p>
      <div>
        <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
          Similar prompts
        </p>
        <ul className="space-y-1.5">
          {explanation.neighbors.map((neighbor) => (
            <li
              key={`${neighbor.prompt}-${neighbor.sim}`}
              className="text-muted-foreground text-sm"
            >
              <span className="text-foreground">
                {(neighbor.sim * 100).toFixed(0)}%
              </span>
              {" · "}
              {neighbor.prompt}
              <span className="text-xs"> → {neighbor.winner.split("/").pop()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
