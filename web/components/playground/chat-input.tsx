"use client";

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

import { LambdaPicker } from "@/components/playground/lambda-picker";
import type { PolicyMode } from "@/lib/policy";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  lambda: number;
  mode: PolicyMode;
  onLambdaChange: (value: number | readonly number[]) => void;
  pending: boolean;
  onSend: () => void;
};

export function ChatInput({
  prompt,
  onPromptChange,
  lambda,
  mode,
  onLambdaChange,
  pending,
  onSend,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex items-end gap-2 rounded-[26px] bg-[var(--pg-composer)] px-3 py-2",
        "outline-none focus-within:ring-1 focus-within:ring-white/15",
      )}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder="Message Bifrost"
        value={prompt}
        disabled={pending}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-[var(--pg-text)] outline-none placeholder:text-[var(--pg-muted)] disabled:opacity-50"
      />
      <div className="mb-1 flex items-center gap-1.5">
        <LambdaPicker
          lambda={lambda}
          mode={mode}
          disabled={pending}
          onLambdaChange={onLambdaChange}
        />
        <button
          type="submit"
          disabled={pending || !prompt.trim()}
          aria-label="Send"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-black outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:bg-[#676767] disabled:text-[#2f2f2f]"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </form>
  );
}
