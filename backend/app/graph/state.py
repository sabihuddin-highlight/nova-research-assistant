"""Shared graph state.

The state is the single source of truth that flows between the four agents.
Every node receives the full state and returns a partial update which LangGraph
merges back in. Annotated reducers append rather than overwrite so we keep an
audit trail of what each agent did across multi-turn conversations and retries.
"""
from __future__ import annotations

import operator
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


ClarityStatus = Literal["clear", "needs_clarification", ""]
ValidationResult = Literal["sufficient", "insufficient", ""]


class ResearchFinding(TypedDict):
    """One piece of evidence collected by the Research Agent."""
    title: str
    url: str
    snippet: str
    source: str


class AgentEvent(TypedDict):
    """Lightweight trace record surfaced to the frontend timeline."""
    agent: str
    summary: str
    detail: dict


class ResearchState(TypedDict, total=False):
    # --- Conversation ---
    # `add_messages` merges new messages by id, supporting multi-turn history.
    messages: Annotated[list[BaseMessage], add_messages]
    current_query: str
    # The company in focus carries across turns so follow-ups like
    # "what about their competitors?" still resolve to the right entity.
    company_focus: str

    # --- Clarity Agent ---
    clarity_status: ClarityStatus
    clarification_question: str

    # --- Research Agent ---
    # `research_findings` and `research_notes` are managed by `research_node`
    # itself: it appends within a turn (so retry loops accumulate evidence)
    # and resets at the start of each new turn (so stale findings from prior
    # turns don't leak into the Validator / Synthesis prompts). Using plain
    # last-write-wins instead of operator.add is what enables that reset.
    research_findings: list[ResearchFinding]
    research_notes: list[str]
    confidence_score: float
    research_attempts: int

    # --- Validator Agent ---
    validation_result: ValidationResult
    validation_reason: str

    # --- Synthesis Agent ---
    final_response: str

    # --- UI trace ---
    agent_trail: Annotated[list[AgentEvent], operator.add]


def initial_turn_state(user_query: str) -> dict:
    """Per-turn fields reset at the top of each new user message.

    Conversation-level fields (`messages`, `company_focus`) are preserved by
    the checkpointer; only the per-turn working memory is cleared.
    """
    return {
        "current_query": user_query,
        "clarity_status": "",
        "clarification_question": "",
        "confidence_score": 0.0,
        "research_attempts": 0,
        "validation_result": "",
        "validation_reason": "",
        "final_response": "",
        # Clear research evidence so the Validator/Synthesis prompts see only
        # this turn's findings. Without this, the operator.add-free field
        # would still carry stale findings forward via last-write-wins.
        "research_findings": [],
        "research_notes": [],
    }
