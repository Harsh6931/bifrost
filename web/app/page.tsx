import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIERS = [
  { name: "Qwen3.7 Flash", price: "$0.13", colour: "var(--chart-1)", width: "4%" },
  { name: "GPT-5 mini", price: "$2.00", colour: "var(--chart-2)", width: "12%" },
  { name: "DeepSeek R1", price: "$2.50", colour: "var(--chart-3)", width: "15%" },
  { name: "Gemini 2.5 Pro", price: "$10.00", colour: "var(--chart-4)", width: "45%" },
  { name: "Claude Sonnet 4.6", price: "$15.00", colour: "var(--chart-5)", width: "68%" },
  { name: "GPT-5.5", price: "$30.00", colour: "var(--chart-baseline)", width: "100%" },
];

const STEPS = [
  {
    title: "Score every candidate",
    body: "Predicted quality minus cost, weighted by a λ you control. One number per model, argmax wins.",
  },
  {
    title: "Route to the cheapest that still answers",
    body: "Hard filters drop anything that can't fit the context or the budget. The rest compete on value.",
  },
  {
    title: "Show the receipts",
    body: "Every decision comes back with the similar prompts that justified it — never a black box.",
  },
];

export default function Home() {
  return (
    <div className="space-y-16 py-8">
      <section className="space-y-6">
        <p
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
          style={{ color: "var(--brand)" }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "var(--brand)" }}
          />
          OpenAI-compatible · one base URL change
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Stop paying frontier prices for{" "}
          <span style={{ color: "var(--chart-bifrost)" }}>
            &ldquo;what&rsquo;s the capital of France?&rdquo;
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
          Bifrost reads each prompt, predicts how well every model would answer
          it, and sends it to the cheapest one that still gets it right — with a
          full explanation of why.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/playground"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Try the playground
          </Link>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            See the savings
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Output price per million tokens
        </h2>
        <ul className="space-y-2.5">
          {TIERS.map((tier) => (
            <li key={tier.name} className="flex items-center gap-4 text-sm">
              <span className="w-40 shrink-0 truncate text-muted-foreground">
                {tier.name}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{ width: tier.width, backgroundColor: tier.colour }}
                />
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums">
                {tier.price}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          A 230× spread. Most prompts never need the top of this list — the
          whole product is knowing which ones do.
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="space-y-2">
            <span
              className="flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
              style={{
                backgroundColor: "var(--brand)",
                color: "var(--brand-foreground)",
              }}
            >
              {index + 1}
            </span>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-sm text-muted-foreground text-pretty">{step.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
