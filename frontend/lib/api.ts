import type { ChatResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function sendMessage(thread_id: string, message: string): Promise<ChatResponse> {
  return post<ChatResponse>("/chat", { thread_id, message });
}

export function resumeWithClarification(thread_id: string, answer: string): Promise<ChatResponse> {
  return post<ChatResponse>("/chat/resume", { thread_id, answer });
}

export function newThreadId(): string {
  // Lightweight client id; thread is fully owned by the server's checkpointer.
  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
