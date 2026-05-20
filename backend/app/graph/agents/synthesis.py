"""Synthesis Agent.

Consumes everything in state and writes the user-facing answer. Preserves
conversation context, references the research findings, and formats the
output as clean Markdown.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.graph.agents._llm import extract_text, get_llm, history_excerpt
from app.graph.state import ResearchState


SYNTHESIS_SYSTEM = """You are the Synthesis Agent — the only agent the user actually reads.

Write a concise, well-structured answer to the user's question using the
provided research findings. Conventions:

- Open with a one-line direct answer or headline.
- Use short Markdown sections (## or **bold** headers) only when they help.
- Cite sources inline as `[domain](url)` after the relevant claim. Do not
  invent URLs — only cite sources that appear in the findings.
- If findings are thin, say so honestly rather than padding with generic prose.
- Maintain conversational continuity: this may be turn 1 or a follow-up.
- No preamble like "Sure, here is..." — just answer.
"""


def synthesis_node(state: ResearchState) -> dict:
    # Synthesis is the only agent that writes prose for the user, so it
    # gets a larger token budget than the routing agents.
    llm = get_llm(temperature=0.2, max_tokens=1536)
    findings = state.get("research_findings", [])

    # Cap findings to keep prompt size bounded — beyond ~10 sources the
    # synthesis quality plateaus and just makes generation slower.
    findings_block = "\n".join(
        f"- {f.get('title')} ({f.get('url')}): {f.get('snippet', '')[:220]}"
        for f in findings[-10:]
    ) or "(no findings collected)"

    prompt = (
        f"User question: {state.get('current_query', '')}\n"
        f"Company in focus: {state.get('company_focus', '') or '(unspecified)'}\n"
        f"Confidence score from research: {state.get('confidence_score', 0):.1f}/10\n"
        f"Validation status: {state.get('validation_result', '(skipped)')}\n\n"
        f"Conversation so far:\n{history_excerpt(state.get('messages', []))}\n\n"
        f"Research findings:\n{findings_block}"
    )

    response = llm.invoke([SystemMessage(SYNTHESIS_SYSTEM), HumanMessage(prompt)]).content
    response_text = extract_text(response)

    return {
        "final_response": response_text,
        "messages": [AIMessage(content=response_text)],
        "agent_trail": [{
            "agent": "Synthesis",
            "summary": "Composed final answer",
            "detail": {
                "char_count": len(response_text),
                "sources_used": len(findings),
            },
        }],
    }
