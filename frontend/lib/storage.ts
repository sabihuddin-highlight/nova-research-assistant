"use client";

import type { Conversation, UIMessage } from "./types";

const CONV_KEY = "nova.conversations.v1";
const MSGS_PREFIX = "nova.messages.";
const CLARIF_PREFIX = "nova.clarification.";

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

/* -------- Conversation list -------- */

export function loadConversations(): Conversation[] {
  const w = safeWindow();
  if (!w) return [];
  try {
    const raw = w.localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.localStorage.setItem(CONV_KEY, JSON.stringify(list));
  } catch {
    // quota / serialization — ignore so the UI never crashes on storage.
  }
}

export function upsertConversation(conv: Conversation): Conversation[] {
  const list = loadConversations();
  const i = list.findIndex((c) => c.id === conv.id);
  if (i === -1) list.unshift(conv);
  else list[i] = conv;
  // Keep most-recently-updated first.
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
  return list;
}

export function patchConversation(id: string, patch: Partial<Conversation>): Conversation[] {
  const list = loadConversations().map((c) =>
    c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
  );
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
  return list;
}

export function deleteConversation(id: string): Conversation[] {
  const list = loadConversations().filter((c) => c.id !== id);
  saveConversations(list);
  const w = safeWindow();
  if (w) {
    try {
      w.localStorage.removeItem(MSGS_PREFIX + id);
      w.localStorage.removeItem(CLARIF_PREFIX + id);
    } catch {
      /* ignore */
    }
  }
  return list;
}

/* -------- Per-conversation message cache --------
 * We persist the rendered UI message list (including agent trails) so that
 * switching back to a past conversation restores the full visualisation
 * without an extra backend round-trip. The server also has the canonical
 * state via the LangGraph checkpointer.
 */

export function loadMessages(id: string): UIMessage[] {
  const w = safeWindow();
  if (!w) return [];
  try {
    const raw = w.localStorage.getItem(MSGS_PREFIX + id);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UIMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMessages(id: string, messages: UIMessage[]): void {
  const w = safeWindow();
  if (!w) return;
  try {
    w.localStorage.setItem(MSGS_PREFIX + id, JSON.stringify(messages));
  } catch {
    /* ignore quota */
  }
}

/* -------- Pending clarification per conversation --------
 * When the server interrupts for clarification, the UI shows a card. If the
 * user navigates away and comes back, we want the card restored — otherwise
 * the thread looks "done" even though the server is still waiting for input.
 */

export function loadClarification(id: string): { question: string } | null {
  const w = safeWindow();
  if (!w) return null;
  try {
    const raw = w.localStorage.getItem(CLARIF_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { question?: string };
    return parsed && typeof parsed.question === "string"
      ? { question: parsed.question }
      : null;
  } catch {
    return null;
  }
}

export function saveClarification(id: string, clar: { question: string } | null): void {
  const w = safeWindow();
  if (!w) return;
  try {
    if (clar === null) w.localStorage.removeItem(CLARIF_PREFIX + id);
    else w.localStorage.setItem(CLARIF_PREFIX + id, JSON.stringify(clar));
  } catch {
    /* ignore */
  }
}

/* -------- Title helpers -------- */

export function deriveTitle(firstUserMessage: string, companyFocus?: string | null): string {
  if (companyFocus && companyFocus.trim().length > 0) {
    return companyFocus.trim().slice(0, 48);
  }
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  return cleaned.length <= 42 ? cleaned : cleaned.slice(0, 42).trimEnd() + "…";
}

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString();
}
