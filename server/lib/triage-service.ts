/**
 * Gemini Flash Triage Service — Layer 1 (RAG-Enhanced)
 *
 * Uses Gemini Flash with RAG (Retrieval-Augmented Generation) context:
 * - Pre-L0 hybrid search results are injected as enriched context
 * - Flash model uses this context to make better classification decisions
 * - More accurate plan_suggestion thanks to context-aware reasoning
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

import {
  TRIAGE_CONFIDENCE_HIGH,
  TRIAGE_CONFIDENCE_LOW,
  SEARCH_MIN_WAIT_MS,
} from "../../config/const";
import type { SearchOrchestratorResult, SearchStatus } from "./search-orchestrator";

// ── Types ─────────────────────────────────────────────────────────────

export interface TriageResult {
  type: "simple" | "complex";
  confidence: number;
  reasoning: string;
  planSuggestion: PlanSuggestion | null;
  searchStatus: SearchStatus;
  responseText?: string; // For simple replies, the direct response
}

export interface PlanSuggestion {
  taskType: "fix" | "create" | "refactor" | "investigate";
  scope: "frontend" | "backend" | "fullstack" | "config";
  suggestedAgents: string[];
  estimatedComplexity: "low" | "medium" | "high";
  keyFilesInvolved: string[];
  reasoningChain: string;
}

interface FlashResponse {
  type: "simple" | "complex";
  confidence: number;
  reasoning: string;
  response?: string;
  plan?: {
    task_type: string;
    scope: string;
    agents: string[];
    complexity: string;
    files: string[];
    reasoning: string;
  };
}

// ── Configuration ─────────────────────────────────────────────────────

/** Gemini Flash model ID */
const FLASH_MODEL = "gemini-2.0-flash";

/** Gemini API endpoint */
const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Gemini API key */
function getApiKey(): string {
  return (
    process.env.AGENT_NATIVE_GEMINI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    ""
  );
}

// ── Prompt Builder ────────────────────────────────────────────────────

const TRIAGE_SYSTEM_PROMPT = `You are a request classifier for a coding assistant with RAG (Retrieval-Augmented Generation) context. Analyze the user's message WITH the provided search context and classify it.

Rules:
- **simple**: Greetings, FAQ, single-step questions, fact lookup, quick explanations, or anything answerable in one message without touching files.
- **complex**: Multi-step tasks, code generation, file modification, refactoring, debugging requiring context, or anything needing sub-agent delegation.

The search context below contains relevant code/documentation from the project. USE IT to:
1. Identify if the user's request maps to existing code (mention which files)
2. Detect patterns/implementations already in the codebase
3. Make a more accurate plan_suggestion based on actual project structure

For complex tasks, also suggest a plan with:
- task_type: fix | create | refactor | investigate
- scope: frontend | backend | fullstack | config
- agents: ["frontend-designer" | "backend-creator" | "test-writer" | "code-reviewer"]
- complexity: low | medium | high
- files: involved file paths (from search context if available, empty if unclear)
- reasoning: one sentence why, referencing search context findings

Output ONLY valid JSON, no markdown or commentary.`;

function buildTriagePrompt(
  userMessage: string,
  searchContext: string,
  ragContext?: string,
): string {
  const searchBlock = searchContext
    ? `\n\nSearch results:\n${searchContext.slice(0, 2000)}`
    : "";

  const ragBlock = ragContext
    ? `\n\nRAG Context (relevant project code/docs from hybrid search):\n${ragContext.slice(0, 3000)}`
    : "";

  return `User message: "${userMessage}"${ragBlock}${searchBlock}`;
}

// ── Gemini Flash API Call ──────────────────────────────────────────────

async function callFlashAPI(
  prompt: string,
  signal?: AbortSignal,
): Promise<FlashResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[triage] No Gemini API key configured. Defaulting to complex.");
    return null;
  }

  try {
    const response = await fetch(
      `${GEMINI_API_ENDPOINT}/${FLASH_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: TRIAGE_SYSTEM_PROMPT }],
          },
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 300,
            topP: 0.95,
          },
        }),
        signal,
      },
    );

    if (!response.ok) {
      console.warn(`[triage] Gemini API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return null;

    // Extract JSON from response (strip any markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as FlashResponse;
  } catch (error) {
    console.error("[triage] Gemini API error:", error);
    return null;
  }
}

// ── Default/Offline Triage ────────────────────────────────────────────

/**
 * Keyword-based triage fallback when Gemini API is unavailable.
 * Detects obvious patterns without any API call.
 */
function defaultTriage(userMessage: string): TriageResult {
  const msg = userMessage.toLowerCase();

  // Simple patterns: greetings, single questions, fact lookups
  const simplePatterns = [
    /^(hi|hello|hey| thanks|good morning|good evening)/i,
    /^what is\b/i,
    /^how (do|does|can|to) \w+ (?!.*(?:fix|create|build|make|write|implement|change|modify|update|add|remove|delete|refactor|migrate))/i,
    /^explain\b/i,
    /^who\b/i,
    /^when\b/i,
    /^where\b/i,
    /^why\b/i,
    /^tell me\b/i,
    /^show me\b/i,
    /^can you explain\b/i,
    /\?$/, // Ends with question mark
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(msg)) {
      return {
        type: "simple",
        confidence: 0.9,
        reasoning: "Simple query pattern detected",
        planSuggestion: null,
        searchStatus: { mcp: "pending", web: "pending" },
      };
    }
  }

  // Complex patterns: code changes, file creation, multi-step tasks
  const complexPatterns = [
    /fix\b.*\b(bug|error|issue|problem|broken|crash)/i,
    /create\b.*\b(app|component|page|api|action|route|endpoint)/i,
    /build\b.*\b(app|feature|component|page|api)/i,
    /add\b.*\b(feature|component|page|route|action|endpoint|test)/i,
    /implement\b/i,
    /refactor\b/i,
    /migrate\b/i,
    /optimize\b/i,
    /debug\b/i,
    /\b(write|generate)\b.*\b(code|test|file)\b/i,
    /\b(multiple|several|many)\b.*\b(file|component|change)\b/i,
    /\bwhole\b.*App/i,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(msg)) {
      return {
        type: "complex",
        confidence: 0.85,
        reasoning: "Complex task pattern detected",
        planSuggestion: {
          taskType: "create",
          scope: "fullstack",
          suggestedAgents: [],
          estimatedComplexity: "medium",
          keyFilesInvolved: [],
          reasoningChain: "Pattern-matched complex task",
        },
        searchStatus: { mcp: "pending", web: "pending" },
      };
    }
  }

  // Default: treat as simple (safe default)
  return {
    type: "simple",
    confidence: 0.5,
    reasoning: "No clear pattern detected, defaulting to simple",
    planSuggestion: null,
    searchStatus: { mcp: "pending", web: "pending" },
  };
}

// ── Main Triage Function ───────────────────────────────────────────────

/**
 * Classify a user request as simple or complex.
 * Now RAG-enhanced: accepts enriched context from Pre-L0 hybrid search.
 *
 * Attempts Gemini Flash first (fastest). Falls back to keyword-based
 * triage if the API is unavailable, times out, or errors.
 */
export async function triageRequest(
  userMessage: string,
  searchResult?: SearchOrchestratorResult,
  ragContext?: string,
): Promise<TriageResult> {
  const startTime = Date.now();

  // Build search context
  const searchContext = searchResult?.sharedContext ?? "";

  // Try Gemini Flash (with 1.5s timeout for triage itself)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    const prompt = buildTriagePrompt(userMessage, searchContext, ragContext);
    const flashResult = await callFlashAPI(prompt, controller.signal);

    if (flashResult) {
      const confidence = Math.max(0, Math.min(1, flashResult.confidence ?? 0.5));
      const type = flashResult.type === "complex" ? "complex" : "simple";

      // Enforce confidence thresholds
      const effectiveType =
        confidence <= TRIAGE_CONFIDENCE_LOW ? "complex" : type;

      return {
        type: effectiveType,
        confidence,
        reasoning: flashResult.reasoning ?? "Gemini Flash classified",
        planSuggestion: flashResult.plan
          ? {
              taskType: (flashResult.plan.task_type as PlanSuggestion["taskType"]) ?? "create",
              scope: (flashResult.plan.scope as PlanSuggestion["scope"]) ?? "fullstack",
              suggestedAgents: flashResult.plan.agents ?? [],
              estimatedComplexity:
                (flashResult.plan.complexity as PlanSuggestion["estimatedComplexity"]) ?? "medium",
              keyFilesInvolved: flashResult.plan.files ?? [],
              reasoningChain: flashResult.plan.reasoning ?? "",
            }
          : null,
        responseText: flashResult.response,
        searchStatus: searchResult?.status ?? {
          mcp: "pending", web: "pending",
        },
      };
    }
  } catch {
    // API failed — fall through to default triage
  } finally {
    clearTimeout(timer);
  }

  // Fallback: keyword-based triage
  const fallback = defaultTriage(userMessage);
  fallback.searchStatus = searchResult?.status ?? fallback.searchStatus;

  console.debug(
    `[triage] Default triage: ${fallback.type} (confidence: ${fallback.confidence}, latency: ${Date.now() - startTime}ms)`,
  );

  return fallback;
}
