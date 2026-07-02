/**
 * Context Assembler — Layer 0
 *
 * Assembles the context block for each conversation turn:
 * 1. Hybrid Search Context (Pre-L0: keyword + semantic retrieval)
 * 2. Observable Memory (long conversation summary from SQL)
 * 3. Learnings (user preferences + project knowledge from SQL Resources)
 * 4. Skills Registry (available tools + agent manifest)
 * 5. Thread Recent Messages (dynamic truncation via Token Budget)
 *
 * Pre-L0 hybrid search runs BEFORE context assembly, so its
 * results (enriched_context) can be injected into the RAG prompt
 * that the triage and main model consume.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 0
 */

import type { EngineMessage } from "@agent-native/core/agent/engine/types";
import {
  allocateBudget,
  formatBudget,
  CONTEXT_TOKEN_BUDGET,
  type BudgetAllocation,
  type TokenBudget,
} from "./token-budget";
import { RAG_CONTEXT_BUDGET } from "../../config/const";

// ── Types ─────────────────────────────────────────────────────────────

export interface SkillSummary {
  name: string;
  description: string;
}

export interface ContextBlock {
  /** System prompt (framework rules + skills + behavioral guidelines) */
  systemPrompt: string;
  /** Recent thread messages after token budget truncation */
  threadMessages: EngineMessage[];
  /** Observational memory block (or null if not available) */
  observationalMemory: string | null;
  /** Learnings block (or null if not available) */
  learnings: string | null;
  /** Compressed skills registry string */
  skillsSummary: string;
  /** Pre-L0 hybrid search context for RAG injection (or null if not available) */
  searchContext: string | null;
  /** Token budget allocation details */
  tokenBudget: TokenBudget;
  /** Components that were truncated due to budget constraints */
  truncated: string[];
}

export interface ContextAssemblerOptions {
  /** Agent system prompt */
  systemPrompt: string;
  /** All thread messages (will be truncated to fit budget) */
  threadMessages: EngineMessage[];
  /** Observational memory block from SQL (null if none) */
  observationalMemory?: string | null;
  /** Learnings from SQL Resources (null if none) */
  learnings?: string | null;
  /** Available skills/agents with brief descriptions */
  skills?: SkillSummary[];
  /** Pre-L0 hybrid search context string (null if none) */
  searchContext?: string | null;
}

// ── Skills Compressor ──────────────────────────────────────────────────

/**
 * Compress skills list into a compact string for the system prompt.
 * Only includes name + first sentence of description to save tokens.
 */
function compressSkills(skills: SkillSummary[] = []): string {
  if (skills.length === 0) return "No additional skills available.";

  const lines = skills.map((s) => {
    const brief = s.description?.split(".")[0]?.trim() ?? s.description;
    return `- **${s.name}**: ${brief}`;
  });

  return lines.join("\n");
}

// ── Context Assembler ──────────────────────────────────────────────────

/**
 * Assemble the full context block for a conversation turn.
 *
 * Priority: System Prompt > Thread Messages > Memory > Learnings.
 * Truncation happens from oldest messages forward, then memory, then learnings.
 */
export function assembleContext(
  options: ContextAssemblerOptions,
): ContextBlock {
  const skillsSummary = compressSkills(options.skills);

  const allocation: BudgetAllocation = {
    systemPrompt: options.systemPrompt,
    threadMessages: options.threadMessages,
    observationalMemory: options.observationalMemory ?? null,
    learnings: options.learnings ?? null,
    skillsSummary,
  };

  const { budget, truncated } = allocateBudget(
    allocation,
    CONTEXT_TOKEN_BUDGET,
  );

  // Log budget usage for debugging
  if (process.env.AGENT_NATIVE_DEBUG_CONTEXT === "1") {
    console.debug(formatBudget(budget));
    if (truncated.length > 0) {
      console.debug(`[context-assembler] Truncated: ${truncated.join(", ")}`);
    }
  }

  return {
    systemPrompt: options.systemPrompt,
    threadMessages: allocation.threadMessages, // Already truncated by allocateBudget
    observationalMemory: truncated.includes("observationalMemory")
      ? null
      : options.observationalMemory ?? null,
    learnings: truncated.includes("learnings")
      ? null
      : options.learnings ?? null,
    searchContext: options.searchContext ?? null,
    skillsSummary: truncated.includes("skillsRegistry")
      ? skillsSummary.split("\n").slice(0, 5).join("\n") // Keep top 5 skills
      : skillsSummary,
    tokenBudget: budget,
    truncated,
  };
}

/**
 * Serialize a ContextBlock into a single string suitable for the system prompt.
 * This is what gets injected before the thread messages.
 */
export function serializeContextBlock(block: ContextBlock): string {
  const parts: string[] = [];

  // Pre-L0: Hybrid Search Context (injected first for RAG)
  if (block.searchContext) {
    parts.push(block.searchContext);
  }

  // Observational Memory
  if (block.observationalMemory) {
    parts.push(block.observationalMemory);
  }

  // Learnings
  if (block.learnings) {
    parts.push(`## Learnings\n${block.learnings}`);
  }

  // Skills Registry
  if (block.skillsSummary) {
    parts.push(`## Available Skills\n${block.skillsSummary}`);
  }

  // Token budget footer (only in debug mode)
  if (process.env.AGENT_NATIVE_DEBUG_CONTEXT === "1") {
    parts.push(
      `<!-- Token Budget: ${block.tokenBudget.total}/${block.tokenBudget.ceiling} -->`,
    );
  }

  return parts.join("\n\n");
}

/**
 * Run Pre-L0 hybrid search and return formatted RAG context string.
 * Called BEFORE context assembly to enrich the prompt with relevant
 * code/docs from both keyword (TF-IDF) and semantic (Zvec) retrieval.
 */
export async function preSearchContext(
  userMessage: string,
): Promise<string | null> {
  try {
    const { hybridSearch, formatHybridResultsForRAG } = await import(
      "./hybrid-retriever"
    );
    const resultSet = await hybridSearch(userMessage, {
      topK: 8,
      minScore: 0,
      scope: "all",
    });

    if (resultSet.results.length === 0) return null;

    return formatHybridResultsForRAG(resultSet, RAG_CONTEXT_BUDGET);
  } catch (error) {
    console.warn("[context-assembler] Pre-L0 hybrid search failed:", error);
    return null;
  }
}
