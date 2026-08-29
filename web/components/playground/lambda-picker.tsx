"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Slider } from "@/components/ui/slider";
import { nearestMode, type PolicyMode } from "@/lib/policy";
import { cn } from "@/lib/utils";

const SHORT_MODE: Record<PolicyMode, string> = {
  quality: "Quality",
  balanced: "Balanced",
  cheap: "Cheap",
};

type LambdaPickerProps = {
  lambda: number;
  mode: PolicyMode;
  disabled?: boolean;
  onLambdaChange: (value: number | readonly number[]) => void;
};

export function LambdaPicker({
  lambda,
  mode,
  disabled = false,
  onLambdaChange,
}: LambdaPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const liveMode = nearestMode(lambda);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/8 px-2.5 font-mono text-[11px] tracking-tight text-[var(--pg-text)] outline-none hover:bg-white/12",
          "focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <span className="text-[13px] leading-none">λ</span>
        {lambda.toFixed(2)}
        <span className="font-sans text-[11px] text-[var(--pg-muted)]">
          {SHORT_MODE[mode]}
        </span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-labelledby={labelId}
          className="absolute right-0 bottom-[calc(100%+10px)] z-50 flex w-[72px] flex-col items-center gap-2 rounded-2xl border border-[var(--pg-hair)] bg-[#171717] px-2 py-3 shadow-[0_8px_40px_rgb(0_0_0/0.45)]"
        >
          <p id={labelId} className="text-center font-sans text-[10px] text-[var(--pg-muted)]">
            Cheap
          </p>
          <div className="h-[140px]">
            <Slider
              orientation="vertical"
              min={0}
              max={100}
              step={1}
              value={[Math.round(lambda * 100)]}
              onValueChange={onLambdaChange}
              disabled={disabled}
              aria-label="Lambda cost-quality tradeoff"
              className="h-full"
            />
          </div>
          <p className="text-center font-sans text-[10px] text-[var(--pg-muted)]">Quality</p>
          <p className="font-mono text-[11px] tabular-nums text-[var(--pg-text)]">
            {lambda.toFixed(2)}
          </p>
          <p className="sr-only">{SHORT_MODE[liveMode]}</p>
        </div>
      ) : null}
    </div>
  );
}
