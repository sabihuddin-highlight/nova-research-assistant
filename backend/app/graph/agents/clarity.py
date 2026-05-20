"""Clarity Agent.

Decides whether the user's query is specific enough to research. A query is
considered clear if (a) a concrete company is identifiable from the message
itself, OR (b) the message is a follow-up that resolves against an
already-established `company_focus` in conversation state.

The clarity check and the user-facing interrupt are split across two nodes so
that resuming from interrupt does not re-run the LLM judgement.
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import interrupt

from app.graph.agents._llm import extract_text, get_llm, history_excerpt
from app.graph.state import ResearchState


CLARITY_SYSTEM = """You are the Clarity Agent in a business research assistant.

Decide whether the user's latest query can be researched right now.

A query is CLEAR when:
- It names a specific company, OR
- It is a follow-up that clearly refers to a company already established in the conversation (e.g. "what about their competitors?" when Stripe was just discussed).

A query NEEDS_CLARIFICATION when:
- No company is named and no prior company context exists, OR
- The reference is genuinely ambiguous (e.g. "Apple" with no context — fruit, the company, or Apple Records?), OR
- The user asks something so vague that you cannot form a search query.

Respond ONLY with strict JSON of the form:
{
  "clarity_status": "clear" | "needs_clarification",
  "company_focus": "<company name if known, else empty string>",
  "clarification_question": "<one short question to ask the user, only if needs_clarification, else empty string>"
}
No prose, no markdown fences.
"""


def _parse_json(text: str) -> dict[str, Any]:
    """Best-effort JSON extraction; LLMs occasionally wrap output in fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def clarity_assess_node(state: ResearchState) -> dict:
    """LLM-judges clarity. Idempotent w.r.t. checkpoint resume."""
    llm = get_llm()
    prior_focus = state.get("company_focus", "")
    user_query = state.get("current_query", "")

    prompt = (
        f"Conversation so far:\n{history_excerpt(state.get('messages', []))}\n\n"
        f"Previously established company focus: {prior_focus or '(none)'}\n\n"
        f"Latest user message: {user_query}"
    )

    raw = extract_text(llm.invoke([SystemMessage(CLARITY_SYSTEM), HumanMessage(prompt)]).content)
    try:
        decision = _parse_json(raw)
    except Exception:
        # Fail open: if the model returns garbage, assume the query is clear
        # and let downstream validation catch low-confidence research.
        decision = {"clarity_status": "clear", "company_focus": prior_focus, "clarification_question": ""}

    status = decision.get("clarity_status", "clear")
    focus = decision.get("company_focus") or prior_focus
    question = decision.get("clarification_question", "")

    return {
        "clarity_status": status,
        "company_focus": focus,
        "clarification_question": question,
        "agent_trail": [{
            "agent": "Clarity",
            "summary": (
                f"Query is clear, focusing on {focus or 'unspecified entity'}"
                if status == "clear"
                else "Query is ambiguous — requesting clarification from user"
            ),
            "detail": {
                "clarity_status": status,
                "company_focus": focus,
                "clarification_question": question,
            },
        }],
    }


def ask_clarification_node(state: ResearchState) -> dict:
    """Pauses the graph and surfaces a question to the human-in-the-loop.

    `interrupt()` raises GraphInterrupt on first invocation and, on resume,
    returns the value the caller supplied via `Command(resume=...)`. We treat
    that value as the user's clarified query and feed it back into state.
    """
    question = state.get("clarification_question") or "Could you clarify which company you mean?"

    user_reply = interrupt({
        "type": "clarification",
        "question": question,
    })

    # `user_reply` is whatever the API layer passed to Command(resume=...).
    # We accept either a plain string or {"answer": "..."} for forward-compat.
    if isinstance(user_reply, dict):
        clarified = user_reply.get("answer", "")
    else:
        clarified = str(user_reply or "")

    # If the original clarity_assess couldn't extract a company (because the
    # query was too vague), use the clarification text itself as a best-guess
    # focus. This keeps the UI's "FOCUS" stat populated for this turn and
    # gives downstream agents an anchor; the *next* turn's clarity_assess
    # will see the full conversation history and refine if needed.
    prior_focus = state.get("company_focus") or ""
    derived_focus = prior_focus or clarified.strip()[:80]

    return {
        "current_query": clarified,
        "company_focus": derived_focus,
        "clarity_status": "clear",
        "clarification_question": "",
        "messages": [HumanMessage(content=clarified)],
        "agent_trail": [{
            "agent": "Clarity",
            "summary": "Received clarification from user",
            "detail": {"user_response": clarified, "company_focus": derived_focus},
        }],
    }
