# AI Prompts Used & Reasoning

This document logs the prompts that drive the four agents inside the graph, plus the meta-prompts I used with AI tools during development. Per the assignment's Open-Resource Policy, I leveraged AI for scaffolding and review; every design decision and the final shape of the code is mine.

---

## Part 1 — Agent prompts (inside the application)

Each agent uses a focused system prompt with a strict JSON output contract. JSON contracts make routing deterministic — the graph routes off `clarity_status`, `confidence_score`, and `validation_result`, so loose prose outputs would have made the conditional edges fragile.

### Clarity Agent — [backend/app/graph/agents/clarity.py](backend/app/graph/agents/clarity.py)

```
You are the Clarity Agent in a business research assistant.

Decide whether the user's latest query can be researched right now.

A query is CLEAR when:
- It names a specific company, OR
- It is a follow-up that clearly refers to a company already established
  in the conversation (e.g. "what about their competitors?" when Stripe
  was just discussed).

A query NEEDS_CLARIFICATION when:
- No company is named and no prior company context exists, OR
- The reference is genuinely ambiguous (e.g. "Apple" with no context —
  fruit, the company, or Apple Records?), OR
- The user asks something so vague that you cannot form a search query.

Respond ONLY with strict JSON of the form:
{
  "clarity_status": "clear" | "needs_clarification",
  "company_focus": "<company name if known, else empty string>",
  "clarification_question": "<one short question, only if needs_clarification>"
}
```

**Reasoning.**
- The two-branch definition explicitly covers the *follow-up* case (a hard requirement of the spec) — without that clause the agent would over-flag "what about their competitors?" as ambiguous.
- The "Apple" example forces the model to recognise that even a named entity can be ambiguous.
- Forcing JSON output (no markdown fences) lets the downstream router treat the response as a typed signal, not natural language.
- I emit `company_focus` here, not in the Research Agent, so it persists across turns even when the Research path is skipped.

### Research Agent — query planner — [backend/app/graph/agents/research.py](backend/app/graph/agents/research.py)

```
You plan web searches for a business-research agent.

Given the user's question and the company in focus, output 1-3 concise
search queries that, together, will surface the most relevant evidence
(news, financials, leadership, products, competitors — whichever the
question needs).

Respond with strict JSON: { "queries": ["query 1", ...] }
```

**Reasoning.** Splitting "plan queries" from "interpret results" gives me two cheaper, more reliable LLM calls instead of one large reasoning call. The planner can also vary search angles ("Stripe 2024 revenue" + "Stripe acquisitions 2024") which produces broader evidence than a single literal lookup. Capped at 3 queries to keep latency and Tavily quota use bounded.

### Research Agent — extraction + self-scoring

```
You are the Research Agent. You have just collected raw search results.

Your job:
1. Extract the most relevant facts that help answer the user's question.
2. Note source URLs so the Synthesis Agent can cite them.
3. Score your own confidence on a 0-10 scale:
   - 0-3: Sparse, off-topic, or contradictory results.
   - 4-5: Some relevant facts but gaps remain on key parts of the question.
   - 6-7: Solid coverage of the main ask, minor gaps acceptable.
   - 8-10: Comprehensive, recent, well-sourced.

Respond with strict JSON: { "confidence_score", "notes", "key_facts" }
```

**Reasoning.** Anchoring the 0–10 scale to descriptive bands prevents the model from collapsing to a default like "7" for everything. The threshold of 6 to skip the Validator is intentionally placed at the boundary between "5 — gaps remain" and "6 — solid coverage": anything below 6 deserves a peer review. The retry hint mechanism (passing `validation_reason` as context on attempt 2+) lets the planner refocus rather than re-running identical searches.

### Validator Agent — [backend/app/graph/agents/validator.py](backend/app/graph/agents/validator.py)

```
You are the Validator Agent.

Independently assess whether the research collected so far is enough to
answer the user's question well. You are not the same agent that did the
research — be honest about gaps.

Sufficient means:
- The findings directly address the user's question.
- Sources are credible (avoid relying entirely on one blog post).
- Key facts (e.g. financials, leadership, news) are recent enough.

Respond with strict JSON: { "validation_result", "reason" }
```

**Reasoning.** The "you are not the same agent" framing is a deliberate de-biasing instruction. In practice this is still the same model, but the framing produces noticeably more critical assessments than asking the Research Agent to self-validate. The `reason` field is required to be specific — that specificity is then handed to the Research Agent as the retry hint.

### Synthesis Agent — [backend/app/graph/agents/synthesis.py](backend/app/graph/agents/synthesis.py)

```
You are the Synthesis Agent — the only agent the user actually reads.

Write a concise, well-structured answer to the user's question using the
provided research findings. Conventions:

- Open with a one-line direct answer or headline.
- Use short Markdown sections only when they help.
- Cite sources inline as [domain](url) after the relevant claim. Do not
  invent URLs — only cite sources that appear in the findings.
- If findings are thin, say so honestly rather than padding with generic prose.
- Maintain conversational continuity: this may be turn 1 or a follow-up.
- No preamble like "Sure, here is..." — just answer.
```

**Reasoning.**
- "Only agent the user actually reads" reinforces that this is the user-facing surface; everything else is plumbing.
- The "Do not invent URLs" instruction is critical for trust — citations from a hallucinated source are worse than no citations. Restricting to the explicit findings list eliminates that risk.
- "Say so honestly" plus the higher temperature (0.3 vs 0.0 for routing agents) lets Synthesis admit uncertainty when the Validator reached `max attempts` with insufficient data, instead of confidently making things up.

---

## Part 2 — Development meta-prompts

Notes on how I used AI coding tools (Claude) during development. The intent here is transparency about *what* I asked for and *why* — the resulting design choices and code structure are my own.

### "Plan a clean LangGraph topology for this spec"
Asked Claude to sketch a state-graph topology given the four agents and their routing rules. The output confirmed my instinct to split the Clarity Agent into two nodes (`clarity_assess` + `ask_clarification`) — important because LangGraph's `interrupt()` re-runs the *whole node* on resume, which would have re-invoked the LLM judgement if I kept everything in one node.

### "What's the right shape for a LangGraph state with append-only fields?"
Used Claude to confirm the `Annotated[list, operator.add]` pattern for `agent_trail` and `research_findings`, and the `add_messages` reducer for conversation messages. This is documented in LangGraph but easy to get wrong — the alternative (returning the entire list every time) would have caused subtle bugs in multi-attempt research loops.

### "Critique my routing"
Asked Claude to find edge cases in the three conditional edges. It caught one I'd missed: if `validation_result` is empty (Research jumped straight to Synthesis with conf≥6), my original `_route_after_validator` would loop indefinitely because the function would have been called with an empty validation result. Fixed by ensuring Validator is the only path to that router.

### "Write a clean Tailwind dark theme palette"
Asked for a small palette suitable for a developer-tool aesthetic — that's where the `ink` and `accent` colour ramps in [frontend/tailwind.config.ts](frontend/tailwind.config.ts) came from. Saved time on bikeshedding hex codes.

### What I deliberately did NOT delegate
- The state schema (chose every field by mapping requirement → field).
- The decision to use a separate Validator LLM call rather than reusing the Research Agent's self-score.
- The interrupt-payload contract between backend and frontend.
- The choice to track `company_focus` as conversation-scoped state rather than re-deriving from message history every turn.
- Error handling defaults (fail-open for clarity, default-to-sufficient for validator) — these are product judgements about latency vs correctness tradeoffs and the user experience when models misbehave.
