"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AgentTimeline } from "./AgentTimeline";
import { SourcesGrid } from "./SourcesGrid";
import type { UIMessage } from "@/lib/types";

interface Props {
  message: UIMessage;
}

export function Message({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center animate-fade-in">
        <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-1 label-mono text-ink-400">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full animate-fade-up ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ink-50 label-mono text-ink-1000" style={{ fontSize: 9 }}>
          AI
        </div>
      )}

      <div
        className={
          isUser
            ? "max-w-[80%] rounded border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-ink-50"
            : "max-w-[85%] rounded border border-white/8 bg-white/[0.02] px-5 py-4 text-sm text-ink-50"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <>
            <div className="label-mono mb-2 flex items-center gap-2 text-ink-500">
              <span>// RESPONSE</span>
              <span className="h-px flex-1 bg-white/8" />
            </div>
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesGrid sources={message.sources} />
        )}

        {!isUser && message.agentTrail && (
          <AgentTimeline
            events={message.agentTrail}
            confidenceScore={message.confidenceScore}
            researchAttempts={message.researchAttempts}
            validationResult={message.validationResult}
            companyFocus={message.companyFocus}
          />
        )}
      </div>
    </div>
  );
}
