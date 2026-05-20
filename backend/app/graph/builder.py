"""Graph construction.

Wires the four agents into the routing topology described in the spec:

    START
      │
      ▼
    clarity_assess ──needs_clarification──▶ ask_clarification ──▶ research
      │ clear                                                       ▲
      ▼                                                             │
    research ──confidence ≥ 6──▶ synthesis                          │
      │ confidence < 6                                              │
      ▼                                                             │
    validator ──insufficient AND attempts < 3────────────────────────┘
      │ sufficient OR attempts ≥ 3
      ▼
    synthesis ──▶ END
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.graph.agents import (
    ask_clarification_node,
    clarity_assess_node,
    research_node,
    synthesis_node,
    validator_node,
)
from app.graph.state import ResearchState


CONFIDENCE_THRESHOLD = 6.0
MAX_RESEARCH_ATTEMPTS = 3


def _route_after_clarity(state: ResearchState) -> Literal["ask_clarification", "research"]:
    if state.get("clarity_status") == "needs_clarification":
        return "ask_clarification"
    return "research"


def _route_after_research(state: ResearchState) -> Literal["validator", "synthesis"]:
    if state.get("confidence_score", 0.0) >= CONFIDENCE_THRESHOLD:
        return "synthesis"
    return "validator"


def _route_after_validator(state: ResearchState) -> Literal["research", "synthesis"]:
    attempts = state.get("research_attempts", 0)
    if (
        state.get("validation_result") == "insufficient"
        and attempts < MAX_RESEARCH_ATTEMPTS
    ):
        return "research"
    return "synthesis"


@lru_cache
def build_graph():
    """Compile the graph once and cache it. Uses MemorySaver for checkpointing,
    which keeps conversation state in-process — fine for a single-server demo.
    Swap for SqliteSaver/PostgresSaver in production.
    """
    builder = StateGraph(ResearchState)

    builder.add_node("clarity_assess", clarity_assess_node)
    builder.add_node("ask_clarification", ask_clarification_node)
    builder.add_node("research", research_node)
    builder.add_node("validator", validator_node)
    builder.add_node("synthesis", synthesis_node)

    builder.add_edge(START, "clarity_assess")
    builder.add_conditional_edges(
        "clarity_assess",
        _route_after_clarity,
        {"ask_clarification": "ask_clarification", "research": "research"},
    )
    builder.add_edge("ask_clarification", "research")
    builder.add_conditional_edges(
        "research",
        _route_after_research,
        {"validator": "validator", "synthesis": "synthesis"},
    )
    builder.add_conditional_edges(
        "validator",
        _route_after_validator,
        {"research": "research", "synthesis": "synthesis"},
    )
    builder.add_edge("synthesis", END)

    return builder.compile(checkpointer=MemorySaver())
