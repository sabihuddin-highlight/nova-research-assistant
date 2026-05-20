# Nova Research Assistant

A full-stack, multi-agent business-research assistant built with **LangGraph**, **FastAPI**, **Google Gemini**, and **Next.js**. Four specialised agents collaborate to gather, validate, and synthesise information about companies, with multi-turn conversation memory and human-in-the-loop clarification.

Built as the Synapse AI Solutions take-home assignment.

---

## Architecture

```
                ┌─────────────────────────────────┐
   USER ──▶     │          Next.js Chat UI        │
                └────────────────┬────────────────┘
                                 │ POST /chat
                                 ▼
                ┌─────────────────────────────────┐
                │            FastAPI              │
                └────────────────┬────────────────┘
                                 ▼
                ┌─────────────────────────────────┐
                │       LangGraph state graph     │
                │                                 │
                │   ┌───────────┐                 │
                │   │  Clarity  │── unclear ──┐   │
                │   └─────┬─────┘             │   │
                │     clear                   ▼   │
                │         │           ┌─────────────┐
                │         │           │  Interrupt  │── user reply ─┐
                │         │           └─────────────┘               │
                │         ▼                                         │
                │   ┌───────────┐  conf<6   ┌───────────┐           │
                │   │ Research  │──────────▶│ Validator │           │
                │   │           │◀──────────│           │           │
                │   └─────┬─────┘  retry    └─────┬─────┘           │
                │    conf≥6 / sufficient /        │                 │
                │    max attempts                 │                 │
                │         ▼                       │                 │
                │   ┌───────────┐                 │                 │
                │   │ Synthesis │◀────────────────┘                 │
                │   └─────┬─────┘                                   │
                │         ▼                                         │
                │        END                                        │
                └───────────────────────────────────────────────────┘
```

### The four agents

| Agent | File | Role | Output | Routes to |
|---|---|---|---|---|
| **Clarity** | [backend/app/graph/agents/clarity.py](backend/app/graph/agents/clarity.py) | Decides if the query is researchable; considers prior turns for follow-ups | `clarity_status`, `company_focus`, `clarification_question` | Interrupt (if unclear) → Research (if clear) |
| **Research** | [backend/app/graph/agents/research.py](backend/app/graph/agents/research.py) | Plans search queries, calls Tavily, extracts facts, self-scores confidence | `research_findings`, `confidence_score` | Validator (conf<6) / Synthesis (conf≥6) |
| **Validator** | [backend/app/graph/agents/validator.py](backend/app/graph/agents/validator.py) | Independent quality check; names specific gaps for retry | `validation_result`, `validation_reason` | Research (if insufficient & attempts<3) / Synthesis |
| **Synthesis** | [backend/app/graph/agents/synthesis.py](backend/app/graph/agents/synthesis.py) | Composes the final Markdown answer with inline citations | `final_response`, appended `AIMessage` | END |

### Key features mapped to spec

- **Multi-turn conversation** — Conversation is keyed by `thread_id`. LangGraph's `MemorySaver` checkpoints the full state per thread; every agent reads `state["messages"]` via the `add_messages` reducer. The Clarity Agent also maintains `company_focus` across turns, so follow-ups like *"what about their competitors?"* resolve to the right entity.
- **Human-in-the-loop** — When the Clarity Agent flags ambiguity, the graph hits a dedicated `ask_clarification` node that calls LangGraph's `interrupt()` primitive. The API returns `status: "needs_clarification"`; the frontend renders an inline card; the user's reply is passed back via `POST /chat/resume` which calls `Command(resume=...)` to resume the graph from the exact pause point.
- **State management** — Typed schema in [backend/app/graph/state.py](backend/app/graph/state.py). Conversation-level fields persist; per-turn working memory (clarity status, confidence, attempts) is reset at the top of each turn via `initial_turn_state`. Append-only fields (`agent_trail`, `research_findings`, `research_notes`) use `operator.add` reducers.
- **Conditional routing** — All three branch points are pure functions of state in [backend/app/graph/builder.py](backend/app/graph/builder.py): `_route_after_clarity`, `_route_after_research`, `_route_after_validator`. The retry loop is capped at 3 attempts.

---

## Project layout

```
synapse-research-assistant/
├── backend/
│   ├── app/
│   │   ├── config.py              # Pydantic settings (env vars)
│   │   ├── main.py                # FastAPI app + CORS
│   │   ├── graph/
│   │   │   ├── state.py           # ResearchState schema
│   │   │   ├── builder.py         # Graph topology, routing, checkpointer
│   │   │   └── agents/
│   │   │       ├── _llm.py        # Shared ChatGoogleGenerativeAI factory
│   │   │       ├── clarity.py     # Clarity Agent + interrupt node
│   │   │       ├── research.py    # Research Agent (Tavily + LLM extraction)
│   │   │       ├── validator.py   # Validator Agent
│   │   │       └── synthesis.py   # Synthesis Agent
│   │   ├── tools/
│   │   │   └── search.py          # Tavily wrapper (MCP-compatible shape)
│   │   └── api/
│   │       ├── routes.py          # /chat, /chat/resume, /thread/{id}, /health
│   │       └── schemas.py         # Pydantic request/response models
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py                     # uvicorn entrypoint
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ChatInterface.tsx      # Top-level chat shell + state
│   │   ├── Message.tsx            # User/assistant bubble (Markdown)
│   │   ├── ClarificationCard.tsx  # Interrupt UI
│   │   └── AgentTimeline.tsx      # Collapsible per-turn agent trace
│   ├── lib/
│   │   ├── api.ts                 # Backend client
│   │   └── types.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   └── next.config.js
│
├── PROMPTS_USED.md                # Required AI-prompts deliverable
├── README.md
└── .gitignore
```

---

## Running locally

### Prerequisites
- Python 3.11+
- Node 18+
- A Google AI Studio API key (free tier — no credit card required: https://aistudio.google.com)
- A Tavily API key (free tier: https://tavily.com)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate           # PowerShell on Windows
# source .venv/bin/activate      # macOS/Linux
pip install -r requirements.txt
copy .env.example .env           # then fill in GOOGLE_API_KEY and TAVILY_API_KEY
python run.py
```

Backend will listen on `http://127.0.0.1:8000`. Quick check: `GET /health`.

### Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local      # default API URL is fine
npm run dev
```

Open `http://localhost:3000`.

---

## API reference

### `POST /chat`
Send a user message. Returns either a final answer or a clarification prompt.

```json
// Request
{ "thread_id": "thread-abc", "message": "Tell me about Anthropic" }

// Response (happy path)
{
  "status": "complete",
  "thread_id": "thread-abc",
  "answer": "Anthropic is an AI safety company...",
  "agent_trail": [
    { "agent": "Clarity", "summary": "...", "detail": {} },
    { "agent": "Research", "summary": "...", "detail": {} },
    { "agent": "Synthesis", "summary": "...", "detail": {} }
  ],
  "confidence_score": 7.5,
  "research_attempts": 1,
  "validation_result": null,
  "company_focus": "Anthropic"
}

// Response (interrupt)
{
  "status": "needs_clarification",
  "thread_id": "thread-abc",
  "clarification_question": "Which company are you asking about?",
  "agent_trail": [ ... ]
}
```

### `POST /chat/resume`
Resume an interrupted run.

```json
{ "thread_id": "thread-abc", "answer": "I meant Anthropic, the AI safety company." }
```

### `GET /thread/{thread_id}`
Return persisted conversation history.

---

## Design notes

**Why a separate `ask_clarification` node?** Because LangGraph re-runs the *entire* node when it resumes from an `interrupt()`. Putting the LLM judgement and the interrupt in the same node would re-invoke the LLM on resume, wasting tokens and risking inconsistent decisions. Splitting them keeps the assessment cached in checkpoint state.

**Why Tavily-python instead of Tavily MCP?** The assignment notes MCP as *preferred*, not required. The MCP server is a thin wrapper over the same HTTP API, and the abstraction in [backend/app/tools/search.py](backend/app/tools/search.py) returns the exact shape an MCP `search` tool would. Swapping to MCP later means replacing one function — the Research Agent and graph are unaffected.

**Why peer-review confidence rather than just trusting the Research Agent?** Self-grading is biased. The Validator Agent is a separate LLM call with a different prompt focused on coverage and source credibility. It can also articulate *specific gaps* that the Research Agent uses as a retry hint on the next loop.

**Why `MemorySaver`?** Simplicity for a take-home. For production, swap to `SqliteSaver` (single line change in `build_graph`) or `PostgresSaver` for multi-replica deployments.

---

## Test scenarios

1. **Clear initial query**: *"What does Stripe do?"* → Clarity:clear → Research → (likely conf≥6) → Synthesis.
2. **Ambiguous query**: *"Tell me about that company"* → Clarity:needs_clarification → interrupt → user replies *"OpenAI"* → Research → Synthesis.
3. **Multi-turn follow-up**: After scenario 1, ask *"Who are their main competitors?"* → Clarity recognises Stripe is the established focus → Research → Synthesis.
4. **Low-confidence retry loop**: *"What was Acme Corp's Q3 2099 revenue?"* (deliberately unanswerable) → Research conf<6 → Validator:insufficient → Research (retry with hint) → ... up to 3 attempts → Synthesis honestly reports gaps.
