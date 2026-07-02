/**
 * Chat template application constants.
 * Centralized configuration values for the chat-first agent-native app.
 *
 * Part of: Code World Architecture Spec v1.0
 */

// ── App Launcher ────────────────────────────────────────────────────────

/** Interval (ms) for polling application_state for launch-app commands. */
export const APP_LAUNCHER_POLL_INTERVAL_MS = 1500;

/**
 * List of app IDs that are allowed to be launched via the launch-app action.
 * Add new app IDs here when they support visual UI embedding.
 */
export const LAUNCH_APP_ALLOWED_IDS: string[] = [
  "design",
  "slides",
  "content",
  "videos",
  "plan",
  "assets",
  "clips",
  "mail",
  "analytics",
  "calendar",
  "brain",
  "forms",
  "dispatch",
  "macros",
];

// ── Token Budget (Layer 0: Context Assembly) ────────────────────────────

/** Total token budget for the context layer (system + messages + memory). */
export const CONTEXT_TOKEN_BUDGET = 8_000;

/** System prompt budget (framework rules + skills list). */
export const SYSTEM_PROMPT_BUDGET = 2_000;

/** Thread messages budget ceiling (dynamic, may shrink for memory). */
export const THREAD_MESSAGES_MAX_BUDGET = 4_000;

/** Observational memory budget ceiling. */
export const OBSERVATIONAL_MEMORY_BUDGET = 1_000;

/** Learnings budget ceiling. */
export const LEARNINGS_BUDGET = 500;

/** Skills registry budget (compressed skill names + descriptions). */
export const SKILLS_REGISTRY_BUDGET = 500;

/** Search results budget (Layer 1: injected into shared_context). */
export const SEARCH_RESULTS_BUDGET = 2_000;

/** Orchestration budget (Layer 2: main model planning). */
export const ORCHESTRATION_BUDGET = 4_000;

// ── Search Configuration (Layer 1: Parallel Search) ─────────────────────

/** Default timeout for Zvec semantic search (ms). */
export const ZVEC_SEARCH_TIMEOUT_MS = 300;

/** Default timeout for MCP file read (ms). */
export const MCP_FILE_READ_TIMEOUT_MS = 500;

/** Default timeout for web search (ms). */
export const WEB_SEARCH_TIMEOUT_MS = 2_000;

/** Minimum wait window for search results before triage (ms). */
export const SEARCH_MIN_WAIT_MS = 150;

// ── Triage Configuration (Layer 1: Gemini Flash Triage) ─────────────────

/** Confidence threshold: above this, execute the triage type decision directly. */
export const TRIAGE_CONFIDENCE_HIGH = 0.8;

/** Confidence threshold: below this, default to complex_task. */
export const TRIAGE_CONFIDENCE_LOW = 0.5;

// ── Zvec Configuration (Hybrid Retrieval) ────────────────────────────

/** Whether Zvec remote vector database is available */
export const ZVEC_ENABLED = Boolean(process.env.AGENT_NATIVE_ZVEC_ENDPOINT);

/** Zvec embedding model name (configured server-side) */
export const ZVEC_EMBEDDING_MODEL = process.env.AGENT_NATIVE_ZVEC_MODEL ?? "bge-large-zh-v1.5";

/** Zvec sync: max documents per batch */
export const ZVEC_SYNC_BATCH_SIZE = 200;

// ── Hybrid Search Configuration (Pre-Layer 0) ────────────────────────

/** Keyword weight for code queries (0-1). Higher = prefer exact matches. */
export const HYBRID_KEYWORD_WEIGHT_CODE = 0.7;

/** Semantic weight for code queries (0-1). */
export const HYBRID_SEMANTIC_WEIGHT_CODE = 0.3;

/** Keyword weight for natural language queries (0-1). */
export const HYBRID_KEYWORD_WEIGHT_NL = 0.4;

/** Semantic weight for natural language queries (0-1). */
export const HYBRID_SEMANTIC_WEIGHT_NL = 0.6;

/** RAG context max tokens injected into system prompt */
export const RAG_CONTEXT_BUDGET = 2_000;

/** Hybrid search timeout (ms) */
export const HYBRID_SEARCH_TIMEOUT_MS = 1_500;

// ── Agent Registry ──────────────────────────────────────────────────────

/** Sub-agents available for complex task delegation. */
export const SUB_AGENTS = {
  "frontend-designer": {
    name: "frontend-designer",
    description: "Generate/update React components with shadcn/ui + Tailwind CSS",
    scope: "frontend" as const,
  },
  "backend-creator": {
    name: "backend-creator",
    description: "Create/update Actions with defineAction + SQL schemas",
    scope: "backend" as const,
  },
  "test-writer": {
    name: "test-writer",
    description: "Generate vitest + testing-library test files",
    scope: "fullstack" as const,
  },
  "code-reviewer": {
    name: "code-reviewer",
    description: "TypeScript static analysis + CodeGraph dependency validation",
    scope: "fullstack" as const,
  },
} as const;
