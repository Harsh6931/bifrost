import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatTile({
  title,
  value,
  hint,
  accent = "var(--chart-2)",
  emphasis = false,
}: {
  title: string;
  value: string;
  hint?: string;
  /** Colour of the rule above the number — ties the tile to its chart. */
  accent?: string;
  /** Bumps the number size for the one metric that matters most. */
  emphasis?: boolean;
}) {
  return (
    <Card size="sm" className="relative overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: accent }}
      />
      <CardContent className="pt-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <p
          className={cn(
            "mt-2 font-semibold tabular-nums tracking-tight",
            emphasis ? "text-3xl" : "text-2xl",
          )}
          style={emphasis ? { color: accent } : undefined}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
