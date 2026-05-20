"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AgentPipeline } from "./AgentPipeline";
import { ClarificationCard } from "./ClarificationCard";
import { ConversationSidebar } from "./ConversationSidebar";
import { HeroBrand } from "./HeroBrand";
import { Message } from "./Message";
import { newThreadId, resumeWithClarification, sendMessage } from "@/lib/api";
import {
  deleteConversation,
  deriveTitle,
  loadClarification,
  loadConversations,
  loadMessages,
  patchConversation,
  saveClarification,
  saveMessages,
  upsertConversation,
} from "@/lib/storage";
import type { ChatResponse, Conversation, UIMessage } from "@/lib/types";

const SUGGESTIONS: { code: string; title: string; query: string }[] = [
  {
    code: "01",
    title: "Stripe — payments / growth",
    query: "What does Stripe do, and how has their revenue changed recently?",
  },
  {
    code: "02",
    title: "Anthropic — funding history",
    query: "Tell me about Anthropic's recent funding rounds and investors.",
  },
  {
    code: "03",
    title: "OpenAI vs Mistral AI",
    query: "Compare OpenAI and Mistral AI as competitors.",
  },
];

const AGENT_ROSTER = [
  { code: "C", name: "Clarity", role: "query triage", color: "#9d7feb" },
  { code: "R", name: "Research", role: "web search", color: "#5ec0d7" },
  { code: "V", name: "Validator", role: "quality check", color: "#d39d3d" },
  { code: "S", name: "Synthesis", role: "composer", color: "#5fb88a" },
];

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [clarification, setClarification] = useState<{ question: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  // Monotonic request id. Each new send/resume gets a fresh id; if the user
  // switches conversations or starts a new one mid-flight, we bump this so
  // the stale request's `finally` becomes a no-op for the pending state.
  const requestIdRef = useRef(0);

  useEffect(() => {
    setConversations(loadConversations());
    // Default the sidebar to closed on phone-sized viewports; otherwise the
    // first paint after hydration shows the full drawer overlaying the chat.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setSidebarCollapsed(true);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    saveMessages(activeId, messages);
  }, [messages, activeId, hydrated]);

  // Persist the pending-clarification card per conversation so it survives
  // a tab switch / reload — the server still has the interrupt pending, and
  // we don't want the UI to silently drop the user's ability to answer it.
  useEffect(() => {
    if (!hydrated || !activeId) return;
    saveClarification(activeId, clarification);
  }, [clarification, activeId, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, clarification, pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        startNewConversation();
      } else if (
        e.key === "/" &&
        !mod &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  );

  /* -------- Conversation management --------
   *
   * Switching conversations is ALWAYS allowed, even mid-request. We bump
   * `requestIdRef` so any in-flight request becomes "stale" — its eventual
   * response will be ignored by `applyResponse`, and its `finally` won't
   * touch `pending` (the gate checks the id matches the current request).
   * The server-side state for the abandoned thread is unaffected; the user
   * can return to it and the answer will already be persisted there.
   */

  const abandonInFlight = () => {
    requestIdRef.current += 1;
    setPending(false);
  };

  const selectConversation = (id: string) => {
    abandonInFlight();
    setActiveId(id);
    setMessages(loadMessages(id));
    setClarification(loadClarification(id));
    setError(null);
    // On mobile the sidebar is a drawer overlay — dismiss it after pick so
    // the user isn't left tapping through the backdrop to see their answer.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setSidebarCollapsed(true);
    }
  };

  const startNewConversation = () => {
    abandonInFlight();
    setActiveId(null);
    setMessages([]);
    setClarification(null);
    setError(null);
    setInput("");
  };

  const removeConversation = (id: string) => {
    const next = deleteConversation(id);
    setConversations(next);
    if (id === activeId) startNewConversation();
  };

  const renameConversation = (id: string, title: string) => {
    setConversations(patchConversation(id, { title }));
  };

  /* -------- Sending / resuming -------- */

  const ensureConversation = (firstUserMessage: string): string => {
    if (activeId) return activeId;
    const id = newThreadId();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: deriveTitle(firstUserMessage),
      createdAt: now,
      updatedAt: now,
    };
    setConversations(upsertConversation(conv));
    setActiveId(id);
    return id;
  };

  const applyResponse = (resp: ChatResponse, threadId: string) => {
    if (resp.status === "needs_clarification") {
      setClarification({ question: resp.clarification_question || "Could you clarify?" });
      return;
    }
    setClarification(null);

    const assistantMsg: UIMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: resp.answer || "(empty response)",
      agentTrail: resp.agent_trail,
      sources: resp.sources,
      confidenceScore: resp.confidence_score,
      researchAttempts: resp.research_attempts,
      validationResult: resp.validation_result,
      companyFocus: resp.company_focus,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    if (resp.company_focus) {
      setConversations(
        patchConversation(threadId, {
          companyFocus: resp.company_focus,
          title: deriveTitle("", resp.company_focus),
        }),
      );
    } else {
      setConversations(patchConversation(threadId, {}));
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || pending) return;
    setError(null);

    const threadId = ensureConversation(text);
    const userMsg: UIMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const myReq = ++requestIdRef.current;
    setPending(true);
    try {
      const resp = await sendMessage(threadId, text);
      if (requestIdRef.current === myReq && activeIdRef.current === threadId) {
        applyResponse(resp, threadId);
      }
    } catch (e) {
      if (requestIdRef.current === myReq) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    } finally {
      if (requestIdRef.current === myReq) setPending(false);
    }
  };

  const resume = async (answer: string) => {
    if (!activeId) return;
    setError(null);
    const threadId = activeId;
    const userMsg: UIMessage = { id: `u-${Date.now()}`, role: "user", content: answer };
    setMessages((prev) => [...prev, userMsg]);
    setClarification(null);
    const myReq = ++requestIdRef.current;
    setPending(true);
    try {
      const resp = await resumeWithClarification(threadId, answer);
      if (requestIdRef.current === myReq && activeIdRef.current === threadId) {
        applyResponse(resp, threadId);
      }
    } catch (e) {
      if (requestIdRef.current === myReq) {
        setError(e instanceof Error ? e.message : "Request failed");
      }
    } finally {
      if (requestIdRef.current === myReq) setPending(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    void send(text);
  };

  const hasContent = messages.length > 0 || !!clarification;

  return (
    <div className="flex h-screen w-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={startNewConversation}
        onDelete={removeConversation}
        onRename={renameConversation}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        busy={pending}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Header — mission-control telemetry strip */}
        <header className="sticky top-0 z-20 glass-strong border-b border-white/5">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                aria-label="Toggle sidebar"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="sm:hidden flex h-8 w-8 items-center justify-center rounded text-ink-300 transition-colors hover:bg-white/[0.06]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="hidden sm:flex items-center gap-3 label-mono">
                <span className="text-ink-100">NOVA</span>
                <span className="text-ink-700">/</span>
                <span>RESEARCH</span>
                <span className="text-ink-700">/</span>
                <span className="text-ink-400">
                  {activeConversation
                    ? activeConversation.companyFocus || "SESSION"
                    : "NEW SESSION"}
                </span>
              </div>
              <div className="sm:hidden min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight text-ink-50">
                  {activeConversation?.title || "New conversation"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 label-mono">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                ONLINE
              </span>
              <button
                type="button"
                onClick={startNewConversation}
                className="hidden sm:inline-flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-2.5 py-1 label-mono text-ink-300 transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-ink-100"
              >
                + NEW
              </button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <main ref={scrollRef} className="scroll-area flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
            {!hasContent && (
              <div className="animate-fade-up">
                {/* Two-column hero: left text, right glyph */}
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="label-mono mb-5 flex items-center gap-3">
                      <span className="text-ink-300">// NOVA / MULTI-AGENT</span>
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-ink-500">v1.0</span>
                    </div>
                    <h2 className="display-headline text-5xl text-ink-50 sm:text-6xl">
                      Business
                      <br />
                      <span className="text-ink-300">Intelligence</span>
                    </h2>
                    <p className="mt-6 max-w-md text-sm leading-relaxed text-ink-400">
                      Four specialised agents collaborate to research companies,
                      validate findings, and synthesise structured answers with
                      cited sources. Built on LangGraph with human-in-the-loop
                      clarification.
                    </p>

                    {/* Agent roster — control-panel style */}
                    <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                      {AGENT_ROSTER.map((a) => (
                        <div key={a.name} className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: a.color, boxShadow: `0 0 8px ${a.color}66` }}
                          />
                          <div className="min-w-0">
                            <div className="label-mono text-ink-100" style={{ fontSize: 10 }}>
                              {a.name}
                            </div>
                            <div className="label-mono text-ink-500" style={{ fontSize: 9, letterSpacing: "0.1em" }}>
                              {a.role}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <HeroBrand />
                  </div>
                </div>

                {/* Mobile glyph */}
                <div className="lg:hidden">
                  <HeroBrand />
                </div>

                {/* Suggestions */}
                <div className="mt-10">
                  <div className="label-mono mb-3 flex items-center gap-3 text-ink-400">
                    <span>// SUGGESTED QUERIES</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={s.title}
                        type="button"
                        onClick={() => void send(s.query)}
                        style={{ animationDelay: `${100 + i * 80}ms` }}
                        className="group corner-marks animate-fade-up rounded border border-white/8 bg-white/[0.015] p-3.5 text-left transition-all hover:border-white/20 hover:bg-white/[0.04]"
                      >
                        <div className="label-mono mb-1.5 text-ink-500">{s.code}</div>
                        <div className="text-sm font-medium text-ink-50 leading-snug">
                          {s.title}
                        </div>
                        <div className="mt-1.5 text-[11px] text-ink-400 line-clamp-2">
                          {s.query}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}

            {clarification && (
              <ClarificationCard
                question={clarification.question}
                onSubmit={resume}
                disabled={pending}
              />
            )}

            {pending && <AgentPipeline />}

            {error && (
              <div className="animate-fade-in rounded border border-red-500/30 bg-red-500/5 px-4 py-2.5 label-mono text-red-300">
                ERROR · {error}
              </div>
            )}
          </div>
        </main>

        {/* Composer */}
        <footer className="sticky bottom-0 z-10 glass-strong border-t border-white/5">
          <div className="mx-auto max-w-3xl px-6 py-4">
            <form onSubmit={onSubmit} className="flex gap-2">
              <div className="gradient-ring flex-1 rounded">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  disabled={pending || !!clarification}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      const text = input.trim();
                      if (text) {
                        setInput("");
                        void send(text);
                      }
                    }
                  }}
                  placeholder={
                    clarification
                      ? "Awaiting clarification above…"
                      : "Query a company  ·  e.g. how is Anthropic doing"
                  }
                  className="w-full rounded border border-white/10 bg-black px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={pending || !!clarification || !input.trim()}
                className="rounded bg-ink-50 px-5 py-3 label-mono text-ink-1000 transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
                style={{ letterSpacing: "0.14em" }}
              >
                <span className="flex items-center gap-1.5">
                  TRANSMIT
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            </form>
            <div className="mt-2.5 flex items-center justify-between label-mono text-ink-500">
              <span>
                THREAD <span className="text-ink-400">{activeId || "—"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
                LINK OK
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
