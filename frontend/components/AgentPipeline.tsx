"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { name: "Clarity",   initial: "C", label: "PARSING QUERY",        color: "#9d7feb" },
  { name: "Research",  initial: "R", label: "SEARCHING WEB",        color: "#5ec0d7" },
  { name: "Validator", initial: "V", label: "CHECKING SUFFICIENCY", color: "#d39d3d" },
  { name: "Synthesis", initial: "S", label: "COMPOSING RESPONSE",   color: "#5fb88a" },
];

const STEP_INTERVAL_MS = 3000;
// After this many seconds on Synthesis, swap the label to a reassuring
// "still composing" message so the user knows nothing is stuck.
const EXTENDED_THRESHOLD_S = 6;

function fmtTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

/** Mission-control style pipeline indicator. Advances through the stages
 *  at a fair-approximation cadence. After reaching Synthesis it stays
 *  pulsing and shows an elapsed-time chip so the user can see progress
 *  even when the final agent takes its time.
 */
export function AgentPipeline() {
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tickStep = window.setInterval(() => {
      setActive((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    const tickTime = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(tickStep);
      window.clearInterval(tickTime);
    };
  }, []);

  const onLast = active === STEPS.length - 1;
  const extended = onLast && elapsed >= EXTENDED_THRESHOLD_S + (STEPS.length - 1) * (STEP_INTERVAL_MS / 1000);
  const labelText = extended ? "STILL COMPOSING — LONG ANSWER" : STEPS[active].label;

  return (
    <div className="flex justify-start animate-fade-up">
      <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ink-50 label-mono text-ink-1000 animate-pulse-soft" style={{ fontSize: 9 }}>
        AI
      </div>
      <div className="rounded border border-white/8 bg-white/[0.02] px-5 py-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-400" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-400" style={{ animationDelay: "180ms" }} />
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent-400" style={{ animationDelay: "360ms" }} />
            </span>
            <span className="shimmer-text">{labelText}</span>
          </div>
          <span className="label-mono tabular-nums text-ink-500">
            T+{fmtTime(elapsed)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {STEPS.map((s, idx) => {
            const isActive = idx === active;
            const isDone = idx < active;
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="relative flex h-7 w-7 items-center justify-center rounded-sm font-mono text-[10px] font-semibold transition-all duration-300"
                    style={{
                      backgroundColor: isActive
                        ? `${s.color}33`
                        : isDone
                          ? `${s.color}22`
                          : "rgba(255,255,255,0.03)",
                      color: isActive || isDone ? s.color : "#535350",
                      boxShadow: isActive
                        ? `inset 0 0 0 1px ${s.color}aa, 0 0 12px -2px ${s.color}88`
                        : isDone
                          ? `inset 0 0 0 1px ${s.color}55`
                          : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-0 animate-ping rounded-sm opacity-40"
                        style={{ backgroundColor: s.color }}
                      />
                    )}
                    <span className="relative">{isDone ? "✓" : s.initial}</span>
                  </div>
                  <span
                    className="label-mono"
                    style={{
                      fontSize: 8,
                      color: isActive ? s.color : isDone ? "#9a9893" : "#3d3d3a",
                    }}
                  >
                    {s.name}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="h-px w-6 -translate-y-2 transition-colors duration-300"
                    style={{ backgroundColor: idx < active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)" }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
