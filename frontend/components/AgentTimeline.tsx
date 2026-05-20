"use client";

import { useState } from "react";

import { ConfidenceMeter } from "./ConfidenceMeter";
import type { AgentEvent } from "@/lib/types";

interface AgentStyle {
  initial: string;
  color: string;
  text: string;
}

const STYLES: Record<string, AgentStyle> = {
  Clarity:    { initial: "C", color: "#9d7feb", text: "text-[#9d7feb]" },
  Research:   { initial: "R", color: "#5ec0d7", text: "text-[#5ec0d7]" },
  Validator:  { initial: "V", color: "#d39d3d", text: "text-[#d39d3d]" },
  Synthesis:  { initial: "S", color: "#5fb88a", text: "text-[#5fb88a]" },
};

const DEFAULT_STYLE: AgentStyle = { initial: "•", color: "#535350", text: "text-ink-300" };

interface Props {
  events: AgentEvent[];
  confidenceScore?: number | null;
  researchAttempts?: number | null;
  validationResult?: string | null;
  companyFocus?: string | null;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-mono text-ink-500">{label}</span>
      <span className="font-mono text-xs text-ink-100">{value}</span>
    </div>
  );
}

export function AgentTimeline({
  events,
  confidenceScore,
  researchAttempts,
  validationResult,
  companyFocus,
}: Props) {
  const [open, setOpen] = useState(true);
  if (!events || events.length === 0) return null;

  const hasStats =
    !!companyFocus ||
    typeof confidenceScore === "number" ||
    typeof researchAttempts === "number" ||
    !!validationResult;

  return (
    <div className="mt-5 overflow-hidden rounded border border-white/8 bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between px-3.5 py-2.5 transition-colors hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2.5 label-mono">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-ink-100">// TRACE</span>
          <span className="text-ink-700">·</span>
          <span className="text-ink-400">
            {String(events.length).padStart(2, "0")} STEPS
          </span>
        </span>
        <span className="font-mono text-sm text-ink-500 transition-transform group-hover:text-ink-300">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4 animate-fade-in">
          {hasStats && (
            <div className="space-y-3">
              {typeof confidenceScore === "number" && (
                <ConfidenceMeter score={confidenceScore} />
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {companyFocus && <Stat label="FOCUS" value={companyFocus} />}
                {typeof researchAttempts === "number" && researchAttempts > 0 && (
                  <Stat label="ATTEMPTS" value={String(researchAttempts).padStart(2, "0")} />
                )}
                {validationResult && (
                  <Stat label="VALIDATION" value={validationResult.toUpperCase()} />
                )}
              </div>
            </div>
          )}

          <ol className="relative space-y-2.5 pl-0">
            <span
              aria-hidden
              className="absolute left-[11px] top-3 bottom-3 w-px bg-white/8"
            />
            {events.map((ev, idx) => {
              const style = STYLES[ev.agent] || DEFAULT_STYLE;
              return (
                <li
                  key={idx}
                  className="relative flex items-start gap-3 animate-fade-up"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <span
                    className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm font-mono text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${style.color}22`,
                      color: style.color,
                      boxShadow: `inset 0 0 0 1px ${style.color}55`,
                    }}
                  >
                    {style.initial}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <div className="label-mono" style={{ color: style.color }}>
                      {ev.agent.toUpperCase()} AGENT
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed text-ink-300">{ev.summary}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
