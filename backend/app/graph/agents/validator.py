"""Validator Agent.

Independent quality check: given the user's question and the accumulated
research findings, decide whether we have enough to answer well. If not, it
returns a short reason that the Research Agent uses as a retry hint.

This is intentionally a separate LLM call from the Research Agent's
self-confidence score — peer-review beats self-grading.
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.agents._llm import extract_text, get_llm
from app.graph.state import ResearchState


VALIDATOR_SYSTEM = """You are the Validator Agent.

Independently assess whether the research collected so far is enough to
answer the user's question well. You are not the same agent that did the
research — be honest about gaps.

Sufficient means:
- The findings directly address the user's question.
- Sources are credible (avoid relying entirely on one blog post).
- Key facts (e.g. financials, leadership, news) are recent enough.

Respond with strict JSON:
{
  "validation_result": "sufficient" | "insufficient",
  "reason": "<1-2 sentences. If insufficient, name the specific gap so the Research Agent can target it on retry.>"
}
"""


def _parse_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def validator_node(state: ResearchState) -> dict:
    llm = get_llm()
    findings = state.get("research_findings", [])
    findings_block = "\n".join(
        f"- {f.get('title')}: {f.get('snippet', '')[:200]}" for f in findings[-12:]
    ) or "(no findings)"

    prompt = (
        f"User question: {state.get('current_query', '')}\n"
        f"Company in focus: {state.get('company_focus', '') or '(unspecified)'}\n"
        f"Research attempts so far: {state.get('research_attempts', 0)}\n"
        f"Most recent research note: {(state.get('research_notes') or [''])[-1]}\n\n"
        f"Findings:\n{findings_block}"
    )

    raw = extract_text(llm.invoke([SystemMessage(VALIDATOR_SYSTEM), HumanMessage(prompt)]).content)
    try:
        verdict = _parse_json(raw)
        result = verdict.get("validation_result", "sufficient")
        reason = verdict.get("reason", "")
    except Exception:
        # Default to sufficient — we'd rather answer with what we have than loop forever.
        result = "sufficient"
        reason = "Validator parse failure; proceeding with current findings."

    return {
        "validation_result": result,
        "validation_reason": reason,
        "agent_trail": [{
            "agent": "Validator",
            "summary": f"Validation: {result} — {reason}",
            "detail": {"validation_result": result, "reason": reason},
        }],
    }
