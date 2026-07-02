# {{APP_NAME}} — Agent Guide

Chat is the minimal chat-first agent-native app template. Keep chat as the
primary surface, add actions for real capabilities, and add screens only when a
workflow needs durable UI around the conversation.

## Core Rules

- Never hardcode API keys, tokens, webhook URLs, signing secrets, private Builder/internal data, customer data, or credential-looking literals. Use secrets/OAuth/runtime configuration and obvious placeholders in examples.
- Follow the root framework contract: data in SQL, actions first, application
  state for navigation/selection, and shared agent chat for AI work.
- Use actions for app operations and keep frontend/API parity.
- Treat the chat as the default UI. When the user asks for a capability, prefer
  adding or improving the action surface first, then add a page, table, form, or
  widget only when the user needs to inspect, compare, approve, or share durable
  objects.
- If the user wants to plug in their own agent backend, keep the app shell and
  thread UI intact and adapt the chat through the framework's `AgentChatRuntime`
  connector helpers instead of forking the transcript/composer UI.
- Keep the action surface small and orthogonal: every action is a tool in the
  model's context window, so prefer one CRUD-style `update` (patch of fields)
  over many per-field actions, reach for an existing generic query / escape
  hatch (`provider-api-*`, dev `db-query`) before minting a new read action,
  mark UI-only or programmatic actions `agentTool: false` to hide them from the
  model (distinct from `toolCallable: false`, which only gates the extension
  iframe), and delete or hide actions the UI no longer uses. See the `actions`
  skill.
- Keep database code provider-agnostic and additive.
- Use `view-screen` or application state when the active page/selection is
  unclear.
- For new features, update UI, actions, skills/instructions, and application
  state when applicable.

## Application State

- `navigation` should describe the current view and selected entity ids. The
  default chat view is `chat` at `/`.
- `navigate` may be used to move the UI when the app supports it.
- `view-screen` is the first tool to call when the user's visible context
  matters.

## Framework Docs Lookup

- Before implementing or explaining non-trivial Agent Native behavior, use the
  `agent-native-docs` skill and the built-in `docs-search` action/tool to read
  the version-matched framework docs bundled with `@agent-native/core`.
- Use the built-in `source-search` action/tool, or search
  `node_modules/@agent-native/core/corpus`, when you need current core or
  first-party template implementation examples.
- Prefer those installed docs over memory or public docs when package APIs,
  generated-app conventions, workspaces, actions, or agent surfaces are involved.

## A2A Cross-App Delegation

This Chat app is the central hub. Other first-party apps are available over
A2A/call-agent and launch-app:

| App ID | Name | When to delegate |
|--------|------|-----------------|
| mail | Mail | Email operations — use call-agent |
| calendar | Calendar | Schedule and booking — use call-agent |
| brain | Brain | Cited knowledge from Slack, meetings — use call-agent |
| analytics | Analytics | Data source charts — use call-agent |
| dispatch | Dispatch | Central Slack/Telegram router — use call-agent |
| forms | Forms | Form builder — use call-agent |
| assets | Assets | Digital asset manager — use call-agent (data) or launch-app (UI) |
| macros | Macros | Automation — use call-agent |
| design | Design | Visual HTML prototyping — use launch-app (full editor) |
| slides | Slides | React presentations — use launch-app (full editor) |
| content | Content | MDX document editing — use launch-app (full editor) |
| videos | Videos | Remotion video editing — use launch-app |
| plan | Plan | Structured visual plans — use call-agent or launch-app |
| clips | Clips | Screen recording / meeting notes — use call-agent or launch-app |

When the agent sees a request that belongs to another domain, it should
proactively delegate using the tool that matches the task:
- **Data/operations without UI** → \`call-agent\` (e.g., "send an email")
- **Need visual editing** → \`launch-app\` (e.g., "design a landing page")

## IDE Layout Contract

This template is the primary shell for code-first IDE experiences. Keep the
layout aligned with a professional editor workflow:

- left sidebar: Explorer, Git, and Search / Replace
- bottom panel: Terminal, Problems, and Debug Console
- right sidebar: Chat as the copilot surface, with Brain and Plan as
  supporting AI panes
- center area: Monaco editor as the main canvas, with tabs and split panes for
  code, preview, or focused tools
- top bar: menu actions, run/debug controls, and lightweight app switching

Brain should act as Chat's knowledge layer instead of a separate primary entry
point. Plan can live in the right sidebar or a central tab when the task needs
structured review. Design, Slides, Analytics, and Dispatch should remain
modular and launch on demand, not as permanently dominant surfaces in the shell.

Do not reintroduce a global iframe/frame architecture unless a specific
embedded tool needs route isolation or its own full editor lifecycle. Prefer
direct embedded panes, tabs, or delegated A2A flows when possible.

## Skills

Read the relevant root skill before implementation: `adding-a-feature`,
`actions`, `agent-native-docs`, `storing-data`, `real-time-sync`, `security`,
`delegate-to-agent`, `frontend-design`, `shadcn-ui`, and
`self-modifying-code`.

## Code World Architecture (v2.0 — Hybrid Retrieval + RAG)

This app implements the **Code World multi-layer conversation architecture** with
Pre-L0 hybrid search, RAG-enhanced triage, and Zvec semantic vector DB.
Full spec: `docs/architecture-spec.md`

### Architecture Layers

```
User Input → Pre-L0: Hybrid Retrieval → L0: Context Assembly → L1: RAG Triage
→ L2: Main Model Orchestration → L3: Sub-Agent Execution + Review
→ L4: Integration + Memory → Output
```

| Layer | Purpose | Key Files |
|-------|---------|-----------|
| **Pre-L0** | Keyword+semantic hybrid search → RAG context | `server/lib/hybrid-retriever.ts`, `server/lib/zvec-client.ts` |
| **L0** | Token budget + context assembly (RAG-aware) | `server/lib/token-budget.ts`, `server/lib/context-assembler.ts` |
| **L1** | Hybrid/MCP/Web parallel search + RAG-enhanced triage | `server/lib/search-orchestrator.ts`, `server/lib/triage-service.ts` |
| **L2** | Main model plan generation + user confirmation | `server/lib/plan-engine.ts`, `server/plugins/plan-routes.ts` |
| **L3** | Sub-agent parallel execution + review | `server/lib/sub-agent-runner.ts`, `server/lib/review-checker.ts` |
| **L4** | Change report + memory + Zvec sync | `server/lib/change-reporter.ts`, `server/lib/memory-writer.ts` |

### All Actions (30 tools)

| Category | Actions |
|----------|---------|
| ✏️ Edit | `file-create`, `file-update`, `file-delete`, `file-batch-update`, `file-restore`, `mcp-file-read` |
| 🔍 Search | `zvec-search`(hybrid), `web-search`, `grep-search`, `image-analyze` |
| ⚡ Execute | `run-command`, `run-test`, `terminal`, `process-manage` |
| ✅ Quality | `type-check`, `lint-fix`, `format-code`, `code-review` |
| 🌿 Git | `git-ops`, `diff-preview` |
| 📊 Insights | `code-insights` |
| 📦 Project | `index-content`(dual-write), `env-ops`, `dependency-manage`, `sync-knowledge` |
| 🧭 Nav | `view-screen`, `navigate`, `launch-app`, `hello` |

### Environment Variables

```bash
# Search
AGENT_NATIVE_ZVEC_ENDPOINT="http://localhost:9090/api/search"
AGENT_NATIVE_ZVEC_API_KEY=""                  # (optional)
AGENT_NATIVE_WEB_SEARCH_PROVIDER="tavily"    # tavily | serpapi | bing
AGENT_NATIVE_TAVILY_API_KEY=""              # Required for web search
AGENT_NATIVE_SERPAPI_KEY=""                  # Fallback web search provider

# Triage
AGENT_NATIVE_GEMINI_API_KEY=""              # Required for Gemini Flash triage

# Zvec (Remote vector database for semantic search)
AGENT_NATIVE_ZVEC_ENDPOINT=""               # http://localhost:9090/api
AGENT_NATIVE_ZVEC_API_KEY=""                # (optional)
AGENT_NATIVE_ZVEC_MODEL="bge-large-zh-v1.5" # Embedding model

# Hybrid Search
AGENT_NATIVE_HYBRID_SEARCH_TIMEOUT="1500"   # ms timeout for hybrid search
AGENT_NATIVE_RAG_CONTEXT_BUDGET="2000"      # Max tokens for RAG injection

# Debug
AGENT_NATIVE_DEBUG_CONTEXT="0"              # Set to "1" to log token budgets
AGENT_NATIVE_REINDEX="false"               # Set to "true" to force re-index
```

### Sub-Agent Registry

| Agent | Scope | Description |
|-------|-------|-------------|
| `frontend-designer` | frontend | React components with shadcn/ui + Tailwind CSS |
| `backend-creator` | backend | Actions with defineAction + SQL schemas |
| `test-writer` | fullstack | vitest + testing-library test files |
| `code-reviewer` | fullstack | TS analysis + CodeGraph dependency validation |

### File Map (Code World Architecture)

```
server/lib/
├── token-budget.ts           # P0: Token budget manager (allocation/truncation)
├── context-assembler.ts      # P0: Context block assembly + Pre-L0 hybrid search (L0)
├── embedder.ts               # P1: TF-IDF + Zvec semantic embedding (dual)
├── vector-store.ts           # P1: SQLite-backed vector search (keyword)
├── zvec-client.ts            # P1: Zvec vector DB client (semantic)
├── hybrid-retriever.ts       # P1: Keyword + Semantic + RRF fusion (Pre-L0) ⭐
├── content-indexer.ts        # P1: Dual-write indexing (local + Zvec)
├── search-orchestrator.ts    # P1: Hybrid + MCP + Web parallel search (L1)
├── triage-service.ts         # P1: RAG-enhanced Gemini Flash classification (L1)
├── progress-emitter.ts       # P2: SSE streaming progress events
├── plan-engine.ts            # P2: Main model orchestration + plan generation (L2)
├── sub-agent-runner.ts       # P3: Dependency-scheduled sub-agent execution (L3)
├── review-checker.ts         # P3: Type/security/style/CodeGraph review (L3)
├── change-reporter.ts        # P4: File change report + commit message (L4)
├── memory-writer.ts          # P4: OM compaction + learnings + CodeGraph (L4)
├── knowledge-sync.ts         # SYS: AGENTS.md↔SQL + Vector index sync
└── knowledge-sync-zvec.ts    # SYS: SQL → Zvec semantic sync ⭐

server/plugins/
├── plan-routes.ts            # P2: Plan confirm/stream/status API routes
└── knowledge-sync.ts         # SYS: Startup knowledge sync hook

actions/
├── zvec-search.ts            # P0+P1: Hybrid search (keyword + semantic + RRF) ⭐
├── web-search.ts             # P0: Web search (Tavily/SerpAPI)
├── mcp-file-read.ts          # P0: Precise file content retrieval
├── index-content.ts          # P1: Content indexing pipeline (dual-write)
├── sync-knowledge.ts         # SYS: Manual knowledge sync trigger
└── code-review.ts            # P3: Comprehensive code review pipeline
```

### Implementation Status

| Phase | Files | Status |
|-------|-------|--------|
| **P0** | token-budget, context-assembler, 3 search actions, config | ✅ Done |
| **P1** | search-orchestrator, triage-service, embedder, vector-store, content-indexer, index-content | ✅ Done |
| **P2** | plan-engine, plan-routes, progress-emitter | ✅ Done |
| **P3** | sub-agent-runner, review-checker, code-review | ✅ Done |
| **P4** | change-reporter, memory-writer | ✅ Done |

### Integration Status

| 组件 | 状态 | 说明 |
|------|------|------|
| 向量数据库 | ✅ | SQLite + TF-IDF，零外部依赖 |
| Zvec-search | ✅ | 默认本地向量库，可选远程 Zvec API |
| 内容索引 | ✅ | `index-content` Action 可索引整个项目 |
| Web 搜索 | 🟡 | 需要 TAVILY_API_KEY |
| Gemini 分流 | 🟡 | 需要 GEMINI_API_KEY，有关键词降级 |
| 审查管道 | 🟡 | security 检查已实现，oxlint 调用待接入 |
| Agent-chat 集成 | ✅ | systemPrompt + tools 全部注册到 agent-chat 插件 |
| Zvec 向量数据库 | ✅ | zvec-client + knowledge-sync-zvec (AGENTS.md/Learnings/Code → Zvec) |
| Hybrid 混合检索 | ✅ | hybrid-retriever (keyword TF-IDF + Zvec semantic + RRF fusion) |
| RAG 检索增强 | ✅ | Pre-L0 search → context-assembler → triage RAG-enhanced prompt |

### About MCP (Model Context Protocol)

The `@agent-native/core` framework has built-in MCP support (`packages/core/src/mcp/`, 29 files).
It provides endpoints at `/_agent-native/mcp` for external MCP clients. However:

- **Our 29 Actions are NOT MCP tools** — they are Agent Tools, called via function calling
  inside Chat conversations. They use HTTP endpoints at `/_agent-native/actions/:name`.
- **MCP tools** are a different protocol, used by external IDEs (Claude Desktop, Cursor).
  The framework provides built-in MCP tools via `builtin-tools.ts` for resource management.
- **No additional MCP registration is needed** for our Actions to work within Chat.

| Concept | Protocol | Used By | Endpoint |
|---------|----------|---------|----------|
| Agent Tool (Action) | Function Calling | Chat Agent | `/_agent-native/actions/:name` |
| MCP Tool | MCP Protocol | External IDEs | `/_agent-native/mcp` |

### SQL Database (4 tables)

All data is stored in SQLite (local dev) or Postgres (deploy). Four core tables:

| Table | Purpose | Persistence |
|-------|---------|-------------|
| `chat_threads` | Full conversation history + messages (JSON blob) | Per-user, cross-session |
| `observational_memory` | Long conversation compaction (Observer + Reflector) | Per-user, per-thread |
| `resources` | AGENTS.md + Learnings (markdown memory files) | Per-user, global |
| `vector_index` | TF-IDF weighted token vectors for keyword search | Global, per-project |

SQL is the single source of truth for app state, auth, settings, and memory.
No data is lost on browser refresh or server restart.

### Vector Database (Zvec + Hybrid Retrieval) ⭐

**Hybrid Retrieval Architecture** — keyword + semantic dual-channel search:

```
Input Query
  │
  ├─ Keyword Channel (TF-IDF)
  │    └─ vector-store.ts → cosine similarity → ranked list A
  │
  └─ Semantic Channel (Zvec) [if configured]
       └─ zvec-client.ts → embedding API → ranked list B
  │
  ▼
RRF Fusion (Reciprocal Rank Fusion)
  → combined ranked list with weights tuned by query type
  → code queries favor keyword (0.7) · NL queries favor semantic (0.6)
```

**Dual-write indexing**:

```
index-content
  ├─ Local:   chunk → TF-IDF embed → vector_index (SQLite)
  └─ Remote:  chunk → Zvec upsert   → Zvec vector DB (if configured)
```

| Component | File | Description |
|-----------|------|-------------|
| Zvec Client | `server/lib/zvec-client.ts` | CRUD + semantic embed + search API |
| Hybrid Retriever | `server/lib/hybrid-retriever.ts` | Keyword + Semantic + RRF fusion (Pre-L0) |
| Vector Store | `server/lib/vector-store.ts` | SQLite CRUD + cosine similarity |
| Embedder | `server/lib/embedder.ts` | TF-IDF + Zvec semantic embedding |
| Content Indexer | `server/lib/content-indexer.ts` | Dual-write pipeline (local + Zvec) |
| Zvec Knowledge Sync | `server/lib/knowledge-sync-zvec.ts` | AGENTS.md/Learnings/Code → Zvec auto-sync |
| Search Action | `actions/zvec-search.ts` | Hybrid search (keyword + semantic + RRF) |

**Upgrade path**: swap `zvec-client.ts` / `embedder.ts` to use pgvector / Qdrant / Pinecone — interface stays the same.

### Knowledge Sync (Auto Startup — 3-way sync)

At server startup, knowledge sync automatically synchronizes ALL stores:

1. **AGENTS.md → SQL Resources** — Agent reads/updates via `resources` tool
2. **Project files → Local Vector Index** — TF-IDF keyword search
3. **All above → Zvec Vector DB** — Semantic embedding search (if configured)

| Trigger | What happens |
|---------|-------------|
| Server startup | Auto-sync all 3 layers (fire-and-forget) |
| `sync-knowledge` action | Manual sync + Zvec reindex |
| Agent updates AGENTS.md/Learnings | Agent calls `sync-knowledge` |
| `AGENT_NATIVE_REINDEX=true` | Force full re-index (local + Zvec) |

```
Server Ready
  │
  ├─ knowledge-sync.ts (Nitro plugin: hook "ready")
  │   ├─ syncAgentsMd()     → SQL Resources ("AGENTS.md")
  │   ├─ syncVectorIndex()  → vector_index table (keyword)
  │   ├─ countLearnings()   → log stats
  │   └─ syncAllToZvec()    → Zvec vector DB (semantic) [if configured]
  │       ├─ AGENTS.md sections → Zvec documents
  │       ├─ Learnings entries  → Zvec documents
  │       └─ Code file chunks   → Zvec documents
  │
  └─ Agent can now:
      • zvec-search → hybrid search (keyword + semantic fusion)
      • resources   → read/write AGENTS.md + learnings
      • sync-knowledge → propagate changes to all stores
```

### Context Assembly (per turn, RAG-Enhanced)

```
Every user message:
  Pre-L0: hybridSearch() → keyword + semantic RRF fusion → RAG context
  ↓
  1. Hybrid Search Context (Pre-L0)              → relevant code/docs (RAG)
  2. Thread Messages (SQL: chat_threads)         → recent 12 messages
  3. Observational Memory (SQL: observational_memory) → compressed summary
  4. Learnings (SQL: resources memory/MEMORY.md) → user prefs
  5. AGENTS.md (SQL: resources AGENTS.md)        → project rules
  6. Skills Registry (local: .agents/skills/)    → skill manifest
  7. System Prompt (code: agent-chat.ts)         → framework rules
  ↓
  Token Budget (8K max, priority truncation)
  ↓
  Assembled context_block → injected into prompt
  → triageService with RAG context (preSearchContext)
  → main model with enriched context
```

---

## Final Conclusions (2026-07-03 · v2.0 Final)

### What We Built

A complete **5-layer + Pre-L0** intelligent coding assistant architecture with
**30 tools**, **6 advanced AI capabilities**, and **5 system services** —
all integrated into a single Agent-Native chat app.

### Key Design Decisions

| Decision | Reason |
|----------|--------|
| **Pre-L0 hybrid retrieval** | Keyword + semantic search runs BEFORE context assembly so RAG results enrich the prompt from the start |
| **TF-IDF + Zvec dual channel** | TF-IDF for exact code symbol matches, Zvec for semantic understanding; RRF fusion combines both |
| **Gemini Flash L1 triage** | Fast/cheap model separates simple queries from complex tasks, saving main model tokens |
| **User plan confirmation** | Main model generates plan → user confirms → execution begins. No blind code changes. |
| **Review grading (critical/warning/suggest)** | Only critical errors block the pipeline; warnings auto-fix and continue |
| **3-way knowledge sync** | AGENTS.md → SQL Resources · Code → vector_index · All → Zvec (on startup) |
| **30 Actions = Agent Tools, NOT MCP** | Our tools use function calling inside Chat, no extra MCP registration needed |

### What Needs Configuration to Work

| Feature | Requirement | Fallback |
|---------|------------|----------|
| Zvec semantic search | `AGENT_NATIVE_ZVEC_ENDPOINT` | TF-IDF keyword only (built-in) |
| Web search | `TAVILY_API_KEY` | Not available |
| Gemini Flash triage | `GEMINI_API_KEY` | Keyword-based triage (built-in) |
| Full code review | `oxlint` binary in PATH | TypeScript type-check only |

### Self-Contained (Zero Config Required)

- Hybrid keyword search (TF-IDF) — always works
- File CRUD (create/update/delete/read/batch/restore)
- Code execution (run-command/run-test/terminal)
- Type checking + code formatting
- Git operations + diff preview
- Context compression + Observational Memory
- Learnings (user preferences persistence)
- AGENTS.md auto-sync to SQL Resources
- Error auto-retry
- CoT reasoning trace + tool call cards + sub-agent progress (frontend)
- Token budget management
