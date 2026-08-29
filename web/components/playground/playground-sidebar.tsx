"use client";

import Link from "next/link";
import { LayoutDashboard, MessageSquare, PanelLeft, SquarePen, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type SidebarChat = {
  id: string;
  title: string;
};

type PlaygroundSidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
  chats: SidebarChat[];
  activeId: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
};

export function PlaygroundSidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onCloseMobile,
  chats,
  activeId,
  onNewChat,
  onSelectChat,
}: PlaygroundSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-[var(--pg-sidebar)] text-[var(--pg-text)]",
        "motion-safe:transition-[width,transform] motion-safe:duration-200",
        collapsed ? "md:w-[52px]" : "md:w-[260px]",
        "fixed inset-y-0 left-0 z-50 w-[260px] md:static md:z-auto",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      <div className="flex h-12 items-center gap-1 px-2">
        {collapsed ? null : (
          <Link
            href="/playground"
            className="flex-1 truncate rounded-md px-2 text-[15px] font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Bifrost
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden size-9 items-center justify-center rounded-lg text-[var(--pg-muted)] outline-none hover:bg-white/10 hover:text-[var(--pg-text)] focus-visible:ring-2 focus-visible:ring-white/40 md:inline-flex"
        >
          <PanelLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--pg-muted)] outline-none hover:bg-white/10 md:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onNewChat}
        className={cn(
          "mx-2 mb-3 inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40",
          collapsed && "md:justify-center",
        )}
      >
        <SquarePen className="size-4 shrink-0" />
        <span className={cn(collapsed && "md:sr-only")}>New chat</span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <p
          className={cn(
            "px-2 pb-1.5 text-[11px] font-medium text-[var(--pg-muted)]",
            collapsed && "md:hidden",
          )}
        >
          Chats
        </p>
        {chats.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectChat(item.id)}
            title={item.title}
            className={cn(
              "mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] leading-5 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40",
              activeId === item.id && "bg-white/10",
              collapsed && "md:justify-center",
            )}
          >
            <MessageSquare className="size-4 shrink-0 text-[var(--pg-muted)]" />
            <span className={cn("truncate", collapsed && "md:sr-only")}>{item.title}</span>
          </button>
        ))}
      </div>

      <nav className="border-t border-[var(--pg-hair)] p-2">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40",
            collapsed && "md:justify-center",
          )}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          <span className={cn(collapsed && "md:sr-only")}>Dashboard</span>
        </Link>
      </nav>
    </aside>
  );
}
