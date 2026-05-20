"""Research Agent.

Calls Tavily search for company information, then asks the LLM to extract
structured findings and self-assess confidence (0–10). On retry attempts the
agent is told what was missing last time so it can broaden or refocus.
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.graph.agents._llm import extract_text, get_llm, history_excerpt
from app.graph.state import ResearchFinding, ResearchState
from app.tools.search import tavily_search


QUERY_PLAN_SYSTEM = """You plan web searches for a business-research agent.

Given the user's question and the company in focus, output 1-3 concise search
queries that, together, will surface the most relevant evidence (news,
financials, leadership, products, competitors — whichever the question needs).

Respond with strict JSON:
{ "queries": ["query 1", "query 2", ...] }
"""


SYNTHESIS_SYSTEM = """You are the Research Agent. You have just collected raw search results.

Your job:
1. Extract the most relevant facts that help answer the user's question.
2. Note source URLs so the Synthesis Agent can cite them.
3. Score your own confidence on a 0-10 scale:
   - 0-3: Sparse, off-topic, or contradictory results.
   - 4-5: Some relevant facts but gaps remain on key parts of the question.
   - 6-7: Solid coverage of the main ask, minor gaps acceptable.
   - 8-10: Comprehensive, recent, well-sourced.

Respond with strict JSON:
{
  "confidence_score": <number 0-10>,
  "notes": "<2-4 sentences summarising what you learned>",
  "key_facts": [
    {"fact": "...", "source_url": "..."},
    ...
  ]
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


def _plan_queries(query: str, company: str, retry_hint: str) -> list[str]:
    llm = get_llm(max_tokens=256)
    prompt = (
        f"User question: {query}\n"
        f"Company in focus: {company or '(unspecified)'}\n"
        f"Retry hint (what was missing previously, if any): {retry_hint or '(none)'}\n"
    )
    raw = extract_text(llm.invoke([SystemMessage(QUERY_PLAN_SYSTEM), HumanMessage(prompt)]).content)
    try:
        plan = _parse_json(raw)
        queries = plan.get("queries") or []
        return [q for q in queries if isinstance(q, str) and q.strip()][:3]
    except Exception:
        seed = f"{company} {query}".strip() if company else query
        return [seed]


def research_node(state: ResearchState) -> dict:
    attempt = state.get("research_attempts", 0) + 1
    user_query = state.get("current_query", "")
    company = state.get("company_focus", "")
    retry_hint = state.get("validation_reason", "") if attempt > 1 else ""

    # First attempt: skip the planner LLM call and search directly. The
    # user's question is usually descriptive enough, and saving a round-trip
    # makes turns noticeably snappier on free-tier Gemini. Retry attempts
    # invoke the planner so it can refocus around the validator's hint.
    if attempt == 1:
        seed = f"{company} {user_query}".strip() if company else user_query
        queries = [seed]
    else:
        queries = _plan_queries(user_query, company, retry_hint)

    raw_results: list[dict] = []
    for q in queries:
        raw_results.extend(tavily_search(q, max_results=5))

    # De-duplicate by URL while preserving order.
    seen: set[str] = set()
    deduped: list[dict] = []
    for r in raw_results:
        url = r.get("url", "")
        if url and url not in seen:
            seen.add(url)
            deduped.append(r)

    if not deduped:
        return {
            "research_attempts": attempt,
            "confidence_score": 0.0,
            "research_notes": [
                f"Attempt {attempt}: search returned no results for queries {queries}."
            ],
            "agent_trail": [{
                "agent": "Research",
                "summary": f"Attempt {attempt}: no search results",
                "detail": {"queries": queries, "result_count": 0},
            }],
        }

    # Hand search results to the LLM for extraction + self-scoring.
    llm = get_llm()
    evidence_block = "\n\n".join(
        f"[{i + 1}] {r.get('title', '')}\nURL: {r.get('url', '')}\n{r.get('content', '')[:600]}"
        for i, r in enumerate(deduped[:10])
    )
    prompt = (
        f"User question: {user_query}\n"
        f"Company in focus: {company or '(unspecified)'}\n"
        f"Conversation so far:\n{history_excerpt(state.get('messages', []))}\n\n"
        f"Search results:\n{evidence_block}"
    )
    raw = extract_text(llm.invoke([SystemMessage(SYNTHESIS_SYSTEM), HumanMessage(prompt)]).content)
    try:
        analysis = _parse_json(raw)
        confidence = float(analysis.get("confidence_score", 0))
        notes = str(analysis.get("notes", "")).strip()
        key_facts = analysis.get("key_facts") or []
    except Exception:
        confidence = 5.0
        notes = "Could not parse research analysis; using raw results."
        key_facts = []

    # Convert top search results into structured findings for the Synthesis
    # Agent. We keep the raw search records (not just key_facts) so synthesis
    # can quote freely and cite sources.
    new_findings: list[ResearchFinding] = [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "snippet": (r.get("content", "") or "")[:500],
            "source": "tavily",
        }
        for r in deduped[:8]
    ]

    # Since `research_findings` no longer uses the operator.add reducer
    # (state.py), this node is responsible for accumulating across retries
    # within a single turn. `initial_turn_state` resets the field to [] at
    # the top of each user message, so on attempt 1 there's nothing to merge.
    existing_findings = list(state.get("research_findings") or [])
    existing_urls = {f.get("url") for f in existing_findings if f.get("url")}
    merged_findings = existing_findings + [
        f for f in new_findings if f["url"] and f["url"] not in existing_urls
    ]
    existing_notes = list(state.get("research_notes") or [])

    return {
        "research_attempts": attempt,
        "confidence_score": confidence,
        "research_findings": merged_findings,
        "research_notes": existing_notes + [
            f"Attempt {attempt} (conf {confidence:.1f}/10): {notes}"
        ],
        "agent_trail": [{
            "agent": "Research",
            "summary": (
                f"Attempt {attempt}: confidence {confidence:.1f}/10 across {len(new_findings)} sources"
            ),
            "detail": {
                "queries": queries,
                "confidence_score": confidence,
                "result_count": len(new_findings),
                "key_facts": key_facts,
            },
        }],
    }
