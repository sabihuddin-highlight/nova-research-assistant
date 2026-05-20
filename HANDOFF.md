# Handoff Prompt — Nova Research Assistant

> Paste the body of this file into a new Antigravity chat. It contains everything the next AI assistant needs to continue the work without losing context.

---

## Who you are talking to

The user is **Sabih**, a developer on Windows 11 (msys2/PowerShell hybrid environment) at `C:\Users\Sabih\synapse-research-assistant\`. He is junior — explain things clearly, don't assume deep familiarity with LangGraph internals. He prefers concise, actionable replies over long explanations.

## The assignment

He is submitting a take-home assignment to **Synapse AI Solutions** for an internship. The brief:

> Build a multi-agent research assistant using **LangGraph** that helps users gather data about businesses. Four specialised agents must collaborate, handle follow-up questions, and prompt the user for clarification when queries are ambiguous.

### Required agents (all implemented)

1. **Clarity Agent** — decides if the query is researchable; emits `clarity_status: "clear" | "needs_clarification"`; routes to interrupt or Research.
2. **Research Agent** — calls Tavily search; emits `confidence_score` 0–10; routes to Validator (conf<6) or Synthesis (conf≥6).
3. **Validator Agent** — independent quality check; emits `validation_result: "sufficient" | "insufficient"`; loops back to Research up to 3 attempts.
4. **Synthesis Agent** — composes the final Markdown answer with inline citations; routes to END.

### Required features (all implemented)

- Multi-turn conversation with persistent state (LangGraph `MemorySaver` checkpointer keyed by `thread_id`).
- Human-in-the-loop **interrupt** via `langgraph.types.interrupt()` and resume via `Command(resume=...)`.
- State schema with append-only reducers for traces/findings.
- Conditional routing on `clarity_status`, `confidence_score`, `validation_result`, plus an attempt counter capped at 3.

### Deliverables (submission)

1. **ZIP** containing all code. NO GitHub. NO YouTube.
2. **PROMPTS_USED.md** — already at the project root, documents every agent's system prompt and the dev meta-prompts used.
3. **Short Loom video** demonstrating the working app. Not yet recorded. See "Next steps" below.

The deadline window from the recruiter email is 20 hours from receipt; assume Sabih is close to that deadline by now.

---

## Tech stack

- **Backend**: Python 3.11 (Windows-native, at `C:\Users\Sabih\AppData\Local\Programs\Python\Python311\python.exe`), FastAPI, LangGraph 1.x, langchain 1.x, langchain-google-genai 4.x.
- **LLM**: Google Gemini via the `google-genai` SDK. Model controlled by `LLM_MODEL` env var; currently `gemini-2.5-flash`. We swap when daily quotas exhaust — see "Daily quota issue" below.
- **Search**: Tavily (`tavily-python` SDK).
- **Frontend**: Next.js 14, TypeScript, Tailwind, React Markdown.
- **Persistence**: In-memory LangGraph `MemorySaver` (per-process). Conversations also persisted client-side in `localStorage`.

The msys2 Python at `C:\msys64\ucrt64\bin\python.exe` does NOT work — `ormsgpack` (a langgraph dep) lacks wheels for it. Always use the Windows-native Python at the path above.

---

## File map

```
C:\Users\Sabih\synapse-research-assistant\
├── backend/
│   ├── .env                         # GOOGLE_API_KEY + TAVILY_API_KEY (do NOT commit)
│   ├── .env.example
│   ├── requirements.txt
│   ├── run.py                       # uvicorn launcher
│   └── app/
│       ├── main.py                  # FastAPI app + CORS
│       ├── config.py                # pydantic-settings, lru_cache'd
│       ├── api/
│       │   ├── routes.py            # POST /chat, /chat/resume; GET /thread/{id}, /health
│       │   └── schemas.py           # ChatRequest, ChatResponse, SourceOut, etc.
│       ├── tools/
│       │   └── search.py            # Tavily wrapper (MCP-compatible shape)
│       └── graph/
│           ├── state.py             # ResearchState TypedDict + reducers
│           ├── builder.py           # StateGraph topology + routing functions
│           └── agents/
│               ├── _llm.py          # ChatGoogleGenerativeAI factory + rate-limit retry
│               ├── clarity.py       # clarity_assess_node + ask_clarification_node
│               ├── research.py      # research_node + planner (skipped on attempt 1)
│               ├── validator.py     # validator_node
│               └── synthesis.py     # synthesis_node
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # app-bg class for the dot-grid background
│   │   ├── page.tsx                 # mounts <ChatInterface/>
│   │   └── globals.css              # dark theme + dot-grid bg + JetBrains Mono + glass utility
│   ├── components/
│   │   ├── ChatInterface.tsx        # top-level shell, hero, composer, keyboard shortcuts
│   │   ├── ConversationSidebar.tsx  # left sidebar with date-grouped conversation history
│   │   ├── HeroBrand.tsx            # SVG dotted-sphere mission-control glyph
│   │   ├── AgentPipeline.tsx        # animated 4-step pipeline shown while pending
│   │   ├── Message.tsx              # user/assistant bubble
│   │   ├── SourcesGrid.tsx          # clickable source cards with favicons
│   │   ├── AgentTimeline.tsx        # collapsible per-turn agent trace
│   │   ├── ConfidenceMeter.tsx      # horizontal gradient confidence bar
│   │   └── ClarificationCard.tsx    # purple interrupt prompt UI
│   ├── lib/
│   │   ├── api.ts                   # backend client (sendMessage, resumeWithClarification)
│   │   ├── storage.ts               # localStorage CRUD + timeAgo helper
│   │   └── types.ts                 # Conversation, ChatResponse, UIMessage, Source
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── package.json
│   └── .env.local.example           # NEXT_PUBLIC_API_URL
│
├── README.md                        # architecture diagram + run instructions + test scenarios
├── PROMPTS_USED.md                  # the required prompts deliverable
└── .gitignore
```

---

## Running locally

Both servers are currently running in the dev environment. To restart from scratch:

### Backend

```powershell
cd C:\Users\Sabih\synapse-research-assistant\backend
# Re-create venv only if it doesn't exist or is broken:
& "C:\Users\Sabih\AppData\Local\Programs\Python\Python311\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install langchain-google-genai
# Then:
.\.venv\Scripts\python.exe run.py
```

Backend serves at `http://127.0.0.1:8000`. Health check: `curl http://127.0.0.1:8000/health`.

### Frontend

```powershell
cd C:\Users\Sabih\synapse-research-assistant\frontend
npm install
npm run dev
```

Frontend serves at `http://127.0.0.1:3000`.

**Important CORS gotcha**: the `.env` includes BOTH `http://localhost:3000` and `http://127.0.0.1:3000` in `ALLOWED_ORIGINS`. Most modern browsers default to `127.0.0.1` for localhost addresses, so if you only allow `localhost`, every preflight fails and the UI shows "Failed to fetch". Keep both.

`get_settings()` in `backend/app/config.py` is `lru_cache`'d. **Editing `.env` does NOT take effect until you restart uvicorn.** Source-code edits are picked up by `--reload`; `.env` edits are not.

---

## API keys

Both already in `backend/.env`:

- `GOOGLE_API_KEY=<scrubbed — get from Sabih or AI Studio>` — Sabih's Google AI Studio key, free tier.
- `TAVILY_API_KEY=<scrubbed — get from Sabih or app.tavily.com>` — Sabih's Tavily key, free tier.

**Before submission**, the `.env` MUST be stripped of these keys (rename to `.env.example` or delete entirely). Otherwise Sabih is leaking his credentials to a stranger.

---

## Daily quota issue (CRITICAL — read this)

Google Gemini's free tier enforces per-model **daily request quotas**. Each model has its own bucket — e.g. `gemini-2.5-flash` has its own 250/day, `gemini-2.5-flash-lite` has its own, etc. We've burned through quotas during development and rotated models a few times:

1. Started on `gemini-2.5-flash` — worked.
2. Switched to `gemini-2.0-flash` to escape an apparent rate limit — got `limit: 0` (this project doesn't have free-tier access to that model). Reverted.
3. Switched to `gemini-2.5-flash-lite` for higher quota — worked, then exhausted daily (20/day on this project, apparently).
4. **Currently** on `gemini-2.5-flash` again (different daily bucket from -lite).

If you see a `RESOURCE_EXHAUSTED` error from Gemini with `retry in Ns` where N is large (>10s), the daily quota for that model is exhausted. Options:

- Wait for midnight Pacific reset.
- Edit `backend/.env` `LLM_MODEL=` to a model with unused quota. Available options confirmed for this key:
  - `gemini-2.5-flash` (default)
  - `gemini-2.5-flash-lite`
  - `gemini-flash-latest` (alias)
  - `gemini-2.0-flash-lite`
- Tell Sabih to add $5 of credit at https://aistudio.google.com/app/apikey — that lifts the limits to effectively unlimited for this use case.

The retry-with-backoff in `backend/app/graph/agents/_llm.py` only handles **per-minute** rate spikes (5s cap, 2 retries). It deliberately does NOT wait for daily-quota retries because those can be 30–60 seconds — the user would think the app froze.

---

## Architecture details that aren't obvious

### LangGraph interrupt is in TWO nodes

`clarity_assess_node` runs the LLM judgement and writes `clarity_status`. If the result is `needs_clarification`, the conditional edge routes to a separate `ask_clarification_node`, which is what actually calls `interrupt()`. Why split? Because LangGraph re-runs the ENTIRE node on resume — if we combined them, every resume would burn another LLM call to re-judge clarity. Splitting keeps the judgement cached in checkpoint state.

### Append-only state fields

`agent_trail` and `research_findings` use `Annotated[list, operator.add]` reducers, so each node's return appends rather than overwrites. The API needs to **slice out only the current turn's additions** before returning to the frontend. See `_prior_lengths()` and `_slice_turn_outputs()` in `backend/app/api/routes.py`.

### The `requestIdRef` pattern in `ChatInterface.tsx`

Switching conversations mid-request is supported. Each `send`/`resume` captures a monotonic id; if the user switches before the response arrives, the id increments, and the response's `applyResponse` and `setPending(false)` checks become no-ops. The server-side state for the abandoned thread is unaffected — Sabih can return to it later and the answer will be persisted there.

### Query planner is skipped on attempt 1

In `research.py`, the first research attempt skips the LLM query planner and searches with the raw user query (+ optional `company_focus` prefix). Retries (attempts 2+) call the planner with `validation_reason` as a "what was missing" hint so it can refocus. This was a deliberate optimisation — the planner was adding ~3 seconds per turn for diminishing returns.

### CORS origins

Must include BOTH `http://localhost:3000` AND `http://127.0.0.1:3000`. They're technically different origins in the browser's view.

---

## What works right now

- Backend at `http://127.0.0.1:8000` with `/health`, `/chat`, `/chat/resume`, `/thread/{id}`.
- Frontend at `http://127.0.0.1:3000`.
- All four agents wire up correctly through LangGraph.
- Tavily search returns real sources (5–10 per query usually).
- Multi-turn memory works — follow-up questions resolve against the established `company_focus`.
- Interrupt + resume works — the Clarity Agent flags ambiguous queries, the UI shows a purple `// CLARITY · INTERRUPT · AWAITING INPUT` card, the user types a clarification, and the graph resumes.
- Sidebar persists conversations via localStorage with date grouping (Today / Yesterday / This week / Earlier).
- Switching conversations mid-request is now safe (requestIdRef pattern).
- Sources block renders below each assistant response with favicons.
- Confidence meter shows as a horizontal gradient bar with tick marks.
- AgentPipeline shows an animated 4-step progression during pending, with a `T+0:00` elapsed counter and an "STILL COMPOSING — LONG ANSWER" message after 6 seconds on Synthesis.
- A full turn takes ~15–20 seconds.

## What is NOT yet done

1. **Loom video recording** — not started. See the script in the README or below.
2. **`.env` scrubbing** — current `.env` has live API keys. Must be removed before zipping.
3. **Bloat folder removal before zipping** — `.venv`, `node_modules`, `.next` must be deleted to keep the zip small.
4. **The zip itself.**
5. **Reply to the recruiter email** — attach zip + Loom link.

## Loom recording script (3–4 minutes)

```
0:00–0:30  Intro: who you are, what you built (LangGraph + FastAPI + Next.js).
0:30–1:30  Click "Stripe's recent growth" suggestion. Show the agent timeline.
           Point at confidence score and citation links.
1:30–2:30  Start a new conversation. Type "tell me about that company".
           Show the purple clarification card pop up. Narrate "Clarity Agent
           paused the graph using LangGraph's interrupt primitive".
           Type "Anthropic" and submit. Show the resume completing.
2:30–3:15  In the same thread, type "Who are their main investors?".
           Note that you only said "their" — the Clarity Agent recognises
           the established focus is Anthropic. Multi-turn memory at work.
3:15–3:45  Show the sidebar. Click between conversations. Mention localStorage
           persistence and the LangGraph checkpointer keeping server-side state.
3:45–4:00  Mention README has the architecture diagram and PROMPTS_USED.md
           has every agent's system prompt with reasoning. End.
```

## Cleanup + zip commands (PowerShell)

```powershell
# Delete the bloat
Remove-Item -Recurse -Force C:\Users\Sabih\synapse-research-assistant\backend\.venv
Remove-Item -Recurse -Force C:\Users\Sabih\synapse-research-assistant\frontend\node_modules
Remove-Item -Recurse -Force C:\Users\Sabih\synapse-research-assistant\frontend\.next
# Delete the credentials
Remove-Item C:\Users\Sabih\synapse-research-assistant\backend\.env
# Create the zip
Compress-Archive -Path C:\Users\Sabih\synapse-research-assistant\* -DestinationPath C:\Users\Sabih\synapse-submission.zip -Force
```

---

## Design choices worth defending if asked

- **Why Gemini, not Anthropic Claude?** The assignment doesn't mandate a specific LLM, and Anthropic requires a paid account ($5 minimum). Gemini's free tier on AI Studio works with just a Google account. Swapping the provider was a one-file change (`_llm.py`), which demonstrates the value of the abstraction.

- **Why Tavily SDK and not Tavily MCP?** The spec says MCP is "preferred" not required. The MCP server is a thin wrapper over the same HTTP API; `backend/app/tools/search.py` returns the exact shape an MCP `search` tool would. Swapping to MCP is a one-function change. Using the SDK kept the demo simpler and synchronous.

- **Why MemorySaver, not SqliteSaver?** It's a take-home demo, not a production system. MemorySaver is a one-line swap for SqliteSaver later. README and PROMPTS_USED note this explicitly.

- **Why split Clarity into two nodes?** See "LangGraph interrupt" above.

- **Why a separate Validator Agent instead of trusting Research's self-score?** Self-grading is biased. The Validator is a different LLM call with a different system prompt focused on coverage gaps. Its `reason` field also feeds back as a retry hint to Research.

---

## How to address Sabih when continuing the work

He sometimes asks open questions ("what do I do next?", "can you explain X like I'm a beginner?") and sometimes asks for direct changes ("remove the keyboard shortcut chips"). Read each message carefully:

- If he's asking what to do procedurally (Loom, zip, email), give an ordered checklist.
- If he's asking how the code works, explain plainly. He's junior — don't over-jargon.
- If he asks for UI changes, just make them — he doesn't want long descriptions of options.
- If he reports a bug, diagnose by reading backend logs (the uvicorn task output) before guessing.
- He prefers terse responses with concrete actions over walls of explanation.

He has been asked to record a Loom; the next 4 hours should mostly be: test the four scenarios end-to-end, record the Loom, scrub `.env`, zip, email.

---

## Final notes

The repo is in a working state. Everything in the spec is implemented. The remaining work is non-technical (record + zip + email) plus any UI tweaks Sabih still wants. Don't refactor for the sake of it — the deadline is what matters now.

If you must change things, change as little as possible. Test before declaring success. Read backend logs at `C:\Users\Sabih\AppData\Local\Temp\claude\C--Users-Sabih\<session>\tasks\<task-id>.output` if a Bash task was used to start the server; otherwise check uvicorn output directly.

Good luck.


