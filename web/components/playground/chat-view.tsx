"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";

import { ChatInput } from "@/components/playground/chat-input";
import {
  PlaygroundSidebar,
  type SidebarChat,
} from "@/components/playground/playground-sidebar";
import { ExplanationPanel } from "@/components/explanation-panel";
import { ModelBadge } from "@/components/model-badge";
import { ScoreComparison } from "@/components/score-comparison";
import { usePlaygroundChat, type ChatTurn } from "@/hooks/use-playground-chat";

type SavedChat = SidebarChat & { turns: ChatTurn[] };

function WhyPanel({ turn }: { turn: ChatTurn }) {
  const [open, setOpen] = useState(false);
  if (!turn.preview) {
    return null;
  }
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-md text-[12px] text-[var(--pg-muted)] outline-none hover:text-[var(--pg-text)] focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {open ? "Hide why" : "Why this model"}
      </button>
      {open ? (
        <div className="mt-2.5 space-y-4 rounded-2xl bg-[var(--pg-bubble)] px-4 py-3">
          <ExplanationPanel
            chosen={turn.preview.chosen}
            mock={turn.preview.mock}
            explanation={turn.preview.explanation}
          />
          <ScoreComparison
            scores={turn.preview.scores}
            chosen={turn.preview.chosen}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ChatView() {
  const chat = usePlaygroundChat();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [saved, setSaved] = useState<SavedChat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [chat.turns, chat.pending]);

  function persistCurrentIfNeeded() {
    if (chat.turns.length === 0) {
      return;
    }
    const title = chat.turns[0]?.prompt.slice(0, 40) || "New chat";
    const id = activeId ?? `chat-${Date.now()}`;
    setSaved((prev) => {
      const next: SavedChat = { id, title, turns: chat.turns };
      const without = prev.filter((item) => item.id !== id);
      return [next, ...without];
    });
    setActiveId(id);
  }

  function onNewChat() {
    persistCurrentIfNeeded();
    setActiveId(null);
    setMobileOpen(false);
    chat.reset();
  }

  function onSelectChat(id: string) {
    persistCurrentIfNeeded();
    const found = saved.find((item) => item.id === id);
    if (!found) {
      return;
    }
    setActiveId(id);
    setMobileOpen(false);
    chat.loadTurns(found.turns);
  }

  return (
    <div className="playground-shell fixed inset-0 z-40 flex bg-[var(--pg-main)] text-[var(--pg-text)]">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <PlaygroundSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((value) => !value)}
        onCloseMobile={() => setMobileOpen(false)}
        chats={saved.map(({ id, title }) => ({ id, title }))}
        activeId={activeId}
        onNewChat={onNewChat}
        onSelectChat={onSelectChat}
      />
      <div className="relative flex min-w-0 flex-1 flex-col bg-[var(--pg-main)]">
        <div className="flex h-12 items-center px-2 md:hidden">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setMobileOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--pg-muted)] outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          {chat.turns.length === 0 ? (
            <div className="flex min-h-[calc(100%-8rem)] flex-col items-center justify-center px-4 pb-28 text-center">
              <p className="text-[32px] font-medium tracking-[-0.02em]">
                What can I help with?
              </p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[48rem] space-y-8 px-4 py-6 pb-40">
              {chat.turns.map((turn) => (
                <div key={turn.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[70%] rounded-[22px] bg-[var(--pg-bubble)] px-5 py-[10px] text-[16px] leading-[1.75]">
                      {turn.prompt}
                    </div>
                  </div>
                  <div className="space-y-2 pr-8">
                    {turn.chosen ? (
                      <ModelBadge model={turn.chosen} mock={turn.mock} />
                    ) : null}
                    <div className="text-[16px] leading-[1.75] whitespace-pre-wrap">
                      {turn.content}
                      {chat.pending &&
                      turn.id === chat.turns[chat.turns.length - 1]?.id
                        ? "▍"
                        : ""}
                    </div>
                    <WhyPanel turn={turn} />
                  </div>
                </div>
              ))}
              {chat.error ? (
                <p className="text-sm text-red-400" role="alert">
                  {chat.error}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="pointer-events-none bg-gradient-to-t from-[var(--pg-main)] via-[var(--pg-main)]/95 to-transparent pt-6">
          <div className="pointer-events-auto mx-auto w-full max-w-[48rem] px-4 pb-3">
            {chat.preview && chat.prompt.trim() ? (
              <p className="mb-2 text-center font-mono text-[11px] text-[var(--pg-muted)]">
                Routes to {chat.preview.chosen.split("/").pop()}
                {chat.previewPending ? "…" : ""}
              </p>
            ) : null}
            <ChatInput
              prompt={chat.prompt}
              onPromptChange={chat.setPrompt}
              lambda={chat.lambda}
              mode={chat.mode}
              onLambdaChange={chat.setLambdaFromSlider}
              pending={chat.pending}
              onSend={() => {
                void chat.send();
              }}
            />
            <p className="mt-2 text-center text-[11px] text-[var(--pg-muted)]">
              λ 0 prefers quality · 1 prefers cost
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
