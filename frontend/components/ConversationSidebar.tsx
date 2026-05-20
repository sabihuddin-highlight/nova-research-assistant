"use client";

import { useMemo, useState } from "react";

import { timeAgo } from "@/lib/storage";
import type { Conversation } from "@/lib/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  busy?: boolean;
}

type Bucket = "Today" | "Yesterday" | "This week" | "Earlier";

function bucketFor(ts: number, now = Date.now()): Bucket {
  const dayMs = 86_400_000;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  if (ts >= start) return "Today";
  if (ts >= start - dayMs) return "Yesterday";
  if (ts >= start - dayMs * 7) return "This week";
  return "Earlier";
}

const BUCKET_ORDER: Bucket[] = ["Today", "Yesterday", "This week", "Earlier"];

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  collapsed,
  onToggle,
  busy,
}: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.companyFocus || "").toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const grouped = useMemo(() => {
    const map: Record<Bucket, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "This week": [],
      Earlier: [],
    };
    for (const c of filtered) map[bucketFor(c.updatedAt)].push(c);
    return map;
  }, [filtered]);

  if (collapsed) {
    // The narrow rail only makes sense on desktop. On mobile, `collapsed`
    // means "fully hidden" — the user opens the drawer (the !collapsed
    // branch below) via the hamburger button in the header.
    return (
      <aside className="hidden sm:flex w-14 shrink-0 flex-col items-center gap-3 border-r border-white/5 bg-black py-4">
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded text-ink-400 transition-colors hover:bg-white/[0.05] hover:text-ink-100"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="New conversation"
          onClick={onNew}
          className="flex h-9 w-9 items-center justify-center rounded bg-ink-50 text-ink-1000 transition-all hover:bg-white disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div className="mt-2 flex flex-col gap-1.5 overflow-y-auto scroll-area">
          {conversations.slice(0, 12).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              title={c.title}
              className={`flex h-9 w-9 items-center justify-center rounded text-xs font-semibold transition-all ${
                c.id === activeId
                  ? "bg-ink-50 text-ink-1000"
                  : "bg-white/[0.04] text-ink-300 hover:bg-white/[0.08] hover:text-ink-100"
              }`}
            >
              {(c.companyFocus || c.title || "?").slice(0, 1).toUpperCase()}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Mobile-only backdrop dims the chat behind the drawer and dismisses
          it on tap. Hidden at sm+ where the sidebar is a normal inline pane. */}
      <div
        onClick={onToggle}
        aria-hidden
        className="sm:hidden fixed inset-0 z-20 bg-black/60"
      />
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[280px] shrink-0 flex-col border-r border-white/5 bg-black sm:static sm:z-auto sm:w-[260px]">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-ink-50">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-1000" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="5" cy="5" r="1.2" />
              <circle cx="19" cy="5" r="1.2" />
              <circle cx="5" cy="19" r="1.2" />
              <circle cx="19" cy="19" r="1.2" />
              <path d="M12 9.5V6M12 18V14.5M9.5 12H6M18 12H14.5" />
            </svg>
          </div>
          <span className="label-mono text-ink-100" style={{ fontSize: 11 }}>NOVA</span>
        </div>
        <button
          type="button"
          aria-label="Collapse sidebar"
          onClick={onToggle}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-500 transition-colors hover:bg-white/[0.05] hover:text-ink-100"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* New conversation */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2.5 rounded border border-white/10 bg-white/[0.02] px-3 py-2 transition-all hover:border-white/25 hover:bg-white/[0.05]"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-ink-50">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-ink-1000" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="label-mono text-ink-100">NEW SESSION</span>
        </button>
      </div>

      {/* Search */}
      {conversations.length > 5 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter…"
              className="w-full rounded border border-white/10 bg-black py-1.5 pl-8 pr-2.5 font-mono text-xs text-ink-100 placeholder:text-ink-500 focus:border-white/25 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* History list */}
      <div className="scroll-area flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <div className="label-mono text-ink-600">// NO SESSIONS</div>
            <div className="mt-1 text-[11px] text-ink-500">
              {conversations.length === 0
                ? "Send a query to begin."
                : "No matches."}
            </div>
          </div>
        ) : (
          BUCKET_ORDER.map((bucket) => {
            const items = grouped[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="mb-2">
                <div className="px-2 pb-1 pt-2 label-mono text-ink-500">
                  // {bucket.toUpperCase()}
                </div>
                <ul className="space-y-0.5">
                  {items.map((c) => {
                    const isActive = c.id === activeId;
                    const isEditing = editing === c.id;
                    const isConfirming = confirmDelete === c.id;

                    return (
                      <li key={c.id}>
                        <div
                          className={`group relative rounded transition-colors ${
                            isActive
                              ? "bg-white/[0.06] ring-1 ring-white/15"
                              : "hover:bg-white/[0.03]"
                          }`}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => {
                                if (draft.trim()) onRename(c.id, draft.trim());
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (draft.trim()) onRename(c.id, draft.trim());
                                  setEditing(null);
                                } else if (e.key === "Escape") {
                                  setEditing(null);
                                }
                              }}
                              className="w-full rounded border border-white/25 bg-black px-3 py-2 text-sm text-ink-50 focus:outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelect(c.id)}
                              className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left"
                            >
                              <span
                                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-sm ${
                                  isActive
                                    ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                                    : "bg-ink-700"
                                }`}
                              />
                              <span className="flex-1 min-w-0">
                                <span
                                  className={`block truncate text-[13px] ${
                                    isActive ? "text-ink-50" : "text-ink-200"
                                  }`}
                                >
                                  {c.title || "Untitled"}
                                </span>
                                <span className="block font-mono text-[10px] text-ink-500">
                                  {c.companyFocus && (
                                    <span className="text-ink-400">{c.companyFocus.toLowerCase()} · </span>
                                  )}
                                  {timeAgo(c.updatedAt)}
                                </span>
                              </span>
                            </button>
                          )}

                          {!isEditing && (
                            <div className="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                              <button
                                type="button"
                                aria-label="Rename"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(c.id);
                                  setDraft(c.title);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded text-ink-400 hover:bg-white/[0.08] hover:text-ink-100"
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                aria-label={isConfirming ? "Confirm delete" : "Delete"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isConfirming) {
                                    onDelete(c.id);
                                    setConfirmDelete(null);
                                  } else {
                                    setConfirmDelete(c.id);
                                    window.setTimeout(
                                      () =>
                                        setConfirmDelete((cur) => (cur === c.id ? null : cur)),
                                      2500,
                                    );
                                  }
                                }}
                                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                                  isConfirming
                                    ? "bg-red-500/20 text-red-300"
                                    : "text-ink-400 hover:bg-white/[0.08] hover:text-red-300"
                                }`}
                              >
                                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>

      {/* Footer telemetry */}
      <div className="border-t border-white/5 px-4 py-3 label-mono text-ink-500">
        <div className="flex items-center justify-between">
          <span>
            SESSIONS · <span className="text-ink-300">{conversations.length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
            LOCAL
          </span>
        </div>
      </div>
      </aside>
    </>
  );
}
