"""HTTP routes.

Two endpoints carry the conversation:
- POST /chat   — send a new user message; returns either a final answer or
                 a clarification prompt if the Clarity Agent interrupted.
- POST /chat/resume — answer a clarification; the graph resumes from the
                      interrupt point and runs to completion.

GET /thread/{id} returns the persisted message history for that conversation.

The thread_id is the LangGraph checkpoint key — passing the same id across
turns is what gives us multi-turn memory.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command

from app.api.schemas import (
    ChatRequest,
    ChatResponse,
    MessageOut,
    ResumeRequest,
    ThreadHistoryResponse,
)
from app.graph.agents._llm import extract_text
from app.graph.builder import build_graph
from app.graph.state import initial_turn_state


logger = logging.getLogger(__name__)
router = APIRouter()


def _classify_llm_error(exc: Exception) -> tuple[int, str]:
    """Map LLM/provider exceptions to a (status_code, user_message) tuple.

    Without this, Gemini quota and transient network errors bubble up as a
    bare 500 'Internal Server Error' — the UI then shows the user a useless
    toast. Translate the common shapes into something actionable.
    """
    msg = str(exc)
    lower = msg.lower()
    if "resource_exhausted" in lower or "429" in msg or "quota" in lower:
        return 503, (
            "LLM quota exhausted for the current model. Wait for the daily "
            "reset, switch LLM_MODEL in backend/.env, or add billing to your "
            "Google AI Studio key."
        )
    if "api key" in lower or "permission_denied" in lower or "unauthorized" in lower:
        return 503, "LLM rejected the API key. Check GOOGLE_API_KEY in backend/.env."
    if "timeout" in lower or "deadline" in lower:
        return 504, "LLM call timed out. Try again."
    if "tavily" in lower:
        return 503, f"Search provider error: {msg}"
    return 500, f"Backend error: {msg}"


def _thread_config(thread_id: str) -> dict[str, Any]:
    return {"configurable": {"thread_id": thread_id}}


def _prior_lengths(graph, config: dict) -> dict[str, int]:
    """Snapshot the length of the append-only `agent_trail` *before* a turn
    runs, so we can slice out only the new events after the graph completes.

    `research_findings` is no longer accumulated across turns (state.py /
    initial_turn_state reset it), so it doesn't need a prior snapshot — the
    full field after the turn IS this turn's evidence.
    """
    snapshot = graph.get_state(config)
    if not snapshot or not snapshot.values:
        return {"agent_trail": 0}
    v = snapshot.values
    return {
        "agent_trail": len(v.get("agent_trail", []) or []),
    }


def _build_response(
    thread_id: str,
    result: dict,
    snapshot_values: dict,
    turn_trail: list,
    turn_sources: list,
) -> ChatResponse:
    """Translate the graph's terminal output into our wire format."""
    interrupts = result.get("__interrupt__") if isinstance(result, dict) else None
    if interrupts:
        payload = interrupts[0].value if interrupts else {}
        return ChatResponse(
            status="needs_clarification",
            thread_id=thread_id,
            clarification_question=payload.get("question", "Could you clarify?"),
            agent_trail=turn_trail,
            sources=turn_sources,
            company_focus=snapshot_values.get("company_focus"),
        )

    return ChatResponse(
        status="complete",
        thread_id=thread_id,
        answer=snapshot_values.get("final_response", "") or result.get("final_response", ""),
        agent_trail=turn_trail,
        sources=turn_sources,
        confidence_score=snapshot_values.get("confidence_score", result.get("confidence_score")),
        research_attempts=snapshot_values.get("research_attempts", result.get("research_attempts")),
        validation_result=snapshot_values.get("validation_result") or result.get("validation_result"),
        company_focus=snapshot_values.get("company_focus") or result.get("company_focus"),
    )


def _slice_turn_outputs(values: dict, prior: dict[str, int]) -> tuple[list, list]:
    """Pull this turn's trail events + findings out of state.

    `agent_trail` is append-only across turns, so slice from the prior
    length. `research_findings` is reset per turn, so the full list IS the
    turn's sources.
    """
    full_trail = values.get("agent_trail", []) or []
    full_findings = values.get("research_findings", []) or []
    return full_trail[prior["agent_trail"]:], full_findings


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    graph = build_graph()
    config = _thread_config(req.thread_id)
    prior = _prior_lengths(graph, config)

    turn_state = initial_turn_state(req.message)
    turn_state["messages"] = [HumanMessage(content=req.message)]

    try:
        result = graph.invoke(turn_state, config=config)
    except HTTPException:
        raise
    except Exception as exc:
        status, msg = _classify_llm_error(exc)
        logger.exception("graph.invoke failed for thread %s", req.thread_id)
        raise HTTPException(status_code=status, detail=msg)

    snapshot = graph.get_state(config)
    values = snapshot.values if snapshot else {}
    turn_trail, turn_sources = _slice_turn_outputs(values, prior)
    return _build_response(req.thread_id, result, values, turn_trail, turn_sources)


@router.post("/chat/resume", response_model=ChatResponse)
def chat_resume(req: ResumeRequest) -> ChatResponse:
    graph = build_graph()
    config = _thread_config(req.thread_id)

    snapshot = graph.get_state(config)
    if not snapshot or not snapshot.next:
        raise HTTPException(
            status_code=400,
            detail="No interrupted run to resume for this thread.",
        )

    # For resume, prior trail length is "everything before the most recent
    # Clarity assess event." The `-1` keeps that event in this turn's slice
    # so the UI sees the assess step that triggered the pause. Clamp to 0
    # in case there's somehow no Clarity event (e.g., race / forced resume).
    prior = {
        "agent_trail": max(len(snapshot.values.get("agent_trail", []) or []) - 1, 0),
    }

    try:
        result = graph.invoke(Command(resume=req.answer), config=config)
    except HTTPException:
        raise
    except Exception as exc:
        status, msg = _classify_llm_error(exc)
        logger.exception("graph.invoke (resume) failed for thread %s", req.thread_id)
        raise HTTPException(status_code=status, detail=msg)

    new_snapshot = graph.get_state(config)
    values = new_snapshot.values if new_snapshot else {}
    turn_trail, turn_sources = _slice_turn_outputs(values, prior)
    return _build_response(req.thread_id, result, values, turn_trail, turn_sources)


@router.get("/thread/{thread_id}", response_model=ThreadHistoryResponse)
def get_thread(thread_id: str) -> ThreadHistoryResponse:
    graph = build_graph()
    snapshot = graph.get_state(_thread_config(thread_id))
    if not snapshot or not snapshot.values:
        return ThreadHistoryResponse(thread_id=thread_id, messages=[], company_focus=None)

    messages_out: list[MessageOut] = []
    for m in snapshot.values.get("messages", []):
        if isinstance(m, HumanMessage):
            messages_out.append(MessageOut(role="user", content=extract_text(m.content)))
        elif isinstance(m, AIMessage):
            messages_out.append(MessageOut(role="assistant", content=extract_text(m.content)))

    return ThreadHistoryResponse(
        thread_id=thread_id,
        messages=messages_out,
        company_focus=snapshot.values.get("company_focus"),
    )


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
