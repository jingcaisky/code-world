/**
 * Token Budget Manager
 *
 * Enforces global token limits across all layers of the conversation pipeline.
 * Ensures the total context never exceeds model limits, with smart truncation
 * that prioritizes recent messages over older memory.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 0 + Cross-cutting
 */

import { countTextTokens } from "@agent-native/core/agent/context-xray/tokenize";
import type { EngineMessage } from "@agent-native/core/agent/engine/types";

// ── Budget Constants ─────────────────────────────────────────────────

/** Context layer total budget (Layer 0: assembly + Layer 1: search results) */
export const CONTEXT_TOKEN_BUDGET = 8_000;

/** System prompt budget (framework rules + skills list) */
export const SYSTEM_PROMPT_BUDGET = 2_000;

/** Skills registry budget (compressed skill names + brief descriptions) */
export const SKILLS_REGISTRY_BUDGET = 500;

/** Thread messages budget ceiling (dynamic, may shrink for memory/learnings) */
export const THREAD_MESSAGES_MAX_BUDGET = 4_000;

/** Observational memory budget ceiling */
export const OBSERVATIONAL_MEMORY_BUDGET = 1_000;

/** Learnings budget ceiling */
export const LEARNINGS_BUDGET = 500;

/** Search results budget (Layer 1: injected into shared_context) */
export const SEARCH_RESULTS_BUDGET = 2_000;

/** Orchestration budget (Layer 2: main model planning) */
export const ORCHESTRATION_BUDGET = 4_000;

// ── Token Estimator ───────────────────────────────────────────────────

/**
 * Quick token estimate (fast path — ~4 chars per token for English baseline).
 * Falls back to the framework tokenizer for accurate counting when needed.
 */
export function estimateTokens(text: string): number {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return 0;
  // Conservative multiplier for CJK + code heavy content
  return Math.ceil(cleaned.length / 3.5);
}

/** Accurate token count using the framework tokenizer */
export async function countTokens(text: string): Promise<number> {
  const result = await countTextTokens(text);
  return result.tokens;
}

// ── Budget Allocator ───────────────────────────────────────────────────

export interface TokenBudget {
  systemPrompt: number;
  threadMessages: number;
  observationalMemory: number;
  learnings: number;
  skillsRegistry: number;
  searchResults: number;
  total: number;
  ceiling: number;
}

export interface BudgetAllocation {
  systemPrompt: string;
  threadMessages: EngineMessage[];
  observationalMemory: string | null;
  learnings: string | null;
  skillsSummary: string;
}

/**
 * Allocate token budget across context components.
 *
 * Priority: System Prompt (fixed) > Thread Messages > Memory > Learnings.
 * If budget overflow, truncates from least-priority components first.
 */
export function allocateBudget(
  allocation: BudgetAllocation,
  ceiling: number = CONTEXT_TOKEN_BUDGET,
): { budget: TokenBudget; truncated: string[] } {
  const budget: TokenBudget = {
    systemPrompt: 0,
    threadMessages: 0,
    observationalMemory: 0,
    learnings: 0,
    skillsRegistry: 0,
    searchResults: 0,
    total: 0,
    ceiling,
  };
  const truncated: string[] = [];

  // 1. System Prompt (fixed, always included)
  budget.systemPrompt = estimateTokens(allocation.systemPrompt);
  if (budget.systemPrompt > SYSTEM_PROMPT_BUDGET) {
    truncated.push("systemPrompt");
    budget.systemPrompt = SYSTEM_PROMPT_BUDGET;
  }

  // 2. Skills Registry (fixed, always included)
  budget.skillsRegistry = estimateTokens(allocation.skillsSummary);
  if (budget.skillsRegistry > SKILLS_REGISTRY_BUDGET) {
    truncated.push("skillsRegistry");
    budget.skillsRegistry = SKILLS_REGISTRY_BUDGET;
  }

  // 3. Thread Messages (priority: recent first)
  const msgTokens = allocation.threadMessages.map((m) => ({
    msg: m,
    tokens: estimateTokens(
      m.content.map((p) => ("text" in p ? p.text : "")).join("\n"),
    ),
  }));

  let remaining =
    ceiling - budget.systemPrompt - budget.skillsRegistry;
  const kept: EngineMessage[] = [];

  // Keep most recent messages until budget exhausted
  for (let i = msgTokens.length - 1; i >= 0; i--) {
    if (msgTokens[i].tokens <= remaining) {
      kept.unshift(msgTokens[i].msg);
      budget.threadMessages += msgTokens[i].tokens;
      remaining -= msgTokens[i].tokens;
    } else {
      break; // Can't fit more — older messages dropped
    }
  }
  if (kept.length < allocation.threadMessages.length) {
    truncated.push(
      `threadMessages (kept ${kept.length}/${allocation.threadMessages.length})`,
    );
  }

  // 4. Observational Memory (fill remaining)
  if (allocation.observationalMemory && remaining > 0) {
    const omTokens = estimateTokens(allocation.observationalMemory);
    const capped = Math.min(omTokens, OBSERVATIONAL_MEMORY_BUDGET, remaining);
    budget.observationalMemory = capped;
    remaining -= capped;
    if (capped < omTokens) truncated.push("observationalMemory");
  }

  // 5. Learnings (fill remaining)
  if (allocation.learnings && remaining > 0) {
    const lTokens = estimateTokens(allocation.learnings);
    const capped = Math.min(lTokens, LEARNINGS_BUDGET, remaining);
    budget.learnings = capped;
    remaining -= capped;
    if (capped < lTokens) truncated.push("learnings");
  }

  budget.total =
    budget.systemPrompt +
    budget.threadMessages +
    budget.observationalMemory +
    budget.learnings +
    budget.skillsRegistry +
    budget.searchResults;

  return { budget, truncated };
}

/**
 * Truncate search results to fit within the search results budget.
 * Keeps the most relevant results, dropping lower-priority ones.
 */
export function truncateSearchResults(
  results: Array<{ text: string; priority: number }>,
  budget: number = SEARCH_RESULTS_BUDGET,
): string {
  // Sort by priority descending
  const sorted = [...results].sort((a, b) => b.priority - a.priority);

  let remaining = budget;
  const kept: string[] = [];

  for (const result of sorted) {
    const tokens = estimateTokens(result.text);
    if (tokens <= remaining) {
      kept.push(result.text);
      remaining -= tokens;
    } else if (remaining > 50) {
      // Truncate partial result to fill remaining budget
      kept.push(result.text.slice(0, Math.floor(remaining * 3.5)) + "...");
      break;
    } else {
      break;
    }
  }

  return kept.join("\n\n---\n\n");
}

/**
 * Serialize a TokenBudget to a compact summary string for logging/debugging.
 */
export function formatBudget(budget: TokenBudget): string {
  const pct = ((budget.total / budget.ceiling) * 100).toFixed(0);
  return [
    `Token Budget: ${budget.total}/${budget.ceiling} (${pct}%)`,
    `  system:  ${budget.systemPrompt}`,
    `  messages: ${budget.threadMessages}`,
    `  memory:  ${budget.observationalMemory}`,
    `  learnings: ${budget.learnings}`,
    `  skills:  ${budget.skillsRegistry}`,
    `  search:  ${budget.searchResults}`,
  ].join("\n");
}
