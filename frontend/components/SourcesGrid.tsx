"use client";

import { useState } from "react";

import type { Source } from "@/lib/types";

interface Props {
  sources: Source[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconOf(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return "";
  }
}

export function SourcesGrid({ sources }: Props) {
  const [showAll, setShowAll] = useState(false);
  if (!sources || sources.length === 0) return null;

  const visible = showAll ? sources : sources.slice(0, 4);

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 label-mono text-ink-500">
        <span>// SOURCES · {String(sources.length).padStart(2, "0")}</span>
        <span className="h-px flex-1 bg-white/8" />
        {sources.length > 4 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-ink-400 hover:text-ink-200"
          >
            {showAll ? "[ COLLAPSE ]" : `[ SHOW ALL ${sources.length} ]`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((s, idx) => {
          const host = hostnameOf(s.url);
          const fav = faviconOf(s.url);
          return (
            <a
              key={`${s.url}-${idx}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-2.5 overflow-hidden rounded border border-white/8 bg-white/[0.015] p-2.5 transition-all hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-center">
                <span className="label-mono w-6 text-center text-ink-600 group-hover:text-ink-400">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white/[0.05]">
                {fav ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fav}
                    alt=""
                    className="h-3.5 w-3.5"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-[10px] text-ink-400">{host[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-ink-100 group-hover:text-white">
                  {s.title || host}
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-ink-500">
                  <span className="truncate">{host}</span>
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 shrink-0 text-ink-500 opacity-0 transition-opacity group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
