"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  question: string;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

export function ClarificationCard({ question, onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <div className="flex justify-start animate-fade-up">
      <div
        className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded label-mono"
        style={{
          backgroundColor: "#9d7feb22",
          color: "#9d7feb",
          boxShadow: "inset 0 0 0 1px #9d7feb55",
          fontSize: 10,
        }}
      >
        C
      </div>
      <div className="relative max-w-[85%] rounded border border-white/8 bg-white/[0.02] px-5 py-4 text-sm">
        <div className="label-mono mb-2 flex items-center gap-2" style={{ color: "#9d7feb" }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full" style={{ backgroundColor: "#9d7feb", opacity: 0.6 }} />
            <span className="relative h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#9d7feb" }} />
          </span>
          // CLARITY · INTERRUPT · AWAITING INPUT
        </div>
        <p className="mb-3.5 leading-relaxed text-ink-50">{question}</p>
        <form onSubmit={submit} className="flex gap-2">
          <div className="gradient-ring flex-1 rounded">
            <input
              ref={inputRef}
              type="text"
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Type your clarification…"
              className="w-full rounded border border-white/10 bg-black px-3.5 py-2.5 text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="rounded bg-ink-50 px-4 py-2.5 label-mono text-ink-1000 transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-500"
            style={{ letterSpacing: "0.14em" }}
          >
            RESUME
          </button>
        </form>
      </div>
    </div>
  );
}
