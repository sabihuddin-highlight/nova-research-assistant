"""Shared LLM factory.

Centralised so every agent uses the same configured model. Using Google
Gemini via the `langchain-google-genai` integration — chosen for its
generous free tier on AI Studio (no credit card required).

Swapping providers means changing only this file: every agent imports
`get_llm()` and treats the returned object as a generic LangChain chat model.
"""
from __future__ import annotations

import re
import time
from functools import lru_cache
from typing import Any

from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import get_settings


class _RateLimitedChatModel:
    """Tiny proxy around ChatGoogleGenerativeAI that retries on 429 errors.

    Gemini's free tier returns `RESOURCE_EXHAUSTED` with a suggested retry
    delay when bursts exceed RPM. We honour it up to a small cap so a single
    request can't stall for more than a few seconds — better to surface the
    error than have the UI spin indefinitely.
    """

    _RETRY_RE = re.compile(r"retry in ([0-9.]+)s", re.IGNORECASE)
    _MAX_RETRIES = 2
    _MAX_DELAY_S = 5.0

    def __init__(self, inner: ChatGoogleGenerativeAI) -> None:
        self._inner = inner

    def invoke(self, messages: list[BaseMessage], **kwargs: Any):
        last_exc: Exception | None = None
        for attempt in range(self._MAX_RETRIES + 1):
            try:
                return self._inner.invoke(messages, **kwargs)
            except Exception as exc:
                msg = str(exc)
                last_exc = exc
                is_rate_limit = "RESOURCE_EXHAUSTED" in msg or "429" in msg
                if not is_rate_limit or attempt == self._MAX_RETRIES:
                    raise
                match = self._RETRY_RE.search(msg)
                delay = float(match.group(1)) if match else 1.5 * (attempt + 1)
                time.sleep(min(delay + 0.2, self._MAX_DELAY_S))
        assert last_exc is not None
        raise last_exc


@lru_cache
def get_llm(temperature: float = 0.0, max_tokens: int = 1024) -> _RateLimitedChatModel:
    """Cached chat model. `max_tokens=1024` is plenty for the JSON outputs
    that routing agents emit; Synthesis bumps this explicitly when it needs
    a longer response.

    `timeout=45` keeps any single LLM call bounded — a hanging request can't
    silently freeze the whole graph.
    """
    settings = get_settings()
    base = ChatGoogleGenerativeAI(
        model=settings.llm_model,
        google_api_key=settings.google_api_key,
        temperature=temperature,
        max_output_tokens=max_tokens,
        timeout=45,
    )
    return _RateLimitedChatModel(base)


def extract_text(content: Any) -> str:
    """Flatten a LangChain `AIMessage.content` into plain text.

    Older Gemini models (e.g. 2.5 Flash) return `content` as a `str`. Newer
    ones (e.g. `gemini-flash-latest`, 3.x previews) return a list of typed
    content blocks like `[{"type": "text", "text": "...", "extras": {...}}]`
    — sometimes with separate "thinking" blocks. The agents need plain text
    for both their JSON parsing and the user-facing answer; without this
    normalisation a list leaks through as the literal string `[{'type'...}]`.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                # Skip reasoning/thinking blocks — they're not the final answer.
                if block.get("type") in {"thinking", "reasoning"}:
                    continue
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
                else:
                    content_val = block.get("content")
                    if isinstance(content_val, str):
                        parts.append(content_val)
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(content)


def history_excerpt(messages: list, limit: int = 6) -> str:
    """Render the last `limit` messages as plain text for prompt context."""
    if not messages:
        return "(no prior turns)"
    tail = messages[-limit:]
    lines = []
    for m in tail:
        role = getattr(m, "type", "unknown")
        content = extract_text(getattr(m, "content", ""))
        # Trim very long messages so the prompt stays compact.
        if len(content) > 600:
            content = content[:600] + "…"
        lines.append(f"[{role}] {content}")
    return "\n".join(lines)
