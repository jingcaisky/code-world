/**
 * Context Compressor — Background Service
 *
 * Automatically compresses long conversation threads when token limits
 * are exceeded. Replaces old raw messages with compact summaries stored
 * in Observational Memory, keeping the agent's context window lean.
 *
 * System-level capability — not an Action. Runs after every turn
 * via fire-and-forget, leveraging the framework's Observational Memory.
 *
 * Trigger: after each agent response, if total thread tokens > 8K
 *
 * Part of: Code World Architecture — System Services
 */

import type { EngineMessage } from "@agent-native/core/agent/engine/types";

// ── Types ────────────────────────────────────────────────────────────

export interface CompressionConfig {
  /** Token threshold to trigger compression (default: 8000) */
  threshold: number;
  /** Maximum recent messages to keep verbatim (default: 12) */
  keepRecent: number;
  /** Maximum summary output tokens (default: 2000) */
  maxSummaryTokens: number;
  /** Whether compression is enabled (default: true) */
  enabled: boolean;
}

export interface CompressionResult {
  threadId: string;
  compressed: boolean;
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  keptRecentMessages: number;
  error?: string;
}

// ── Default Config ───────────────────────────────────────────────────

const DEFAULT_CONFIG: CompressionConfig = {
  threshold: 8_000,
  keepRecent: 12,
  maxSummaryTokens: 2_000,
  enabled: true,
};

/** Load config from env or defaults */
export function loadCompressionConfig(): CompressionConfig {
  return {
    threshold: parseInt(
      process.env.CW_COMPRESSION_THRESHOLD ?? String(DEFAULT_CONFIG.threshold),
      10,
    ),
    keepRecent: parseInt(
      process.env.CW_COMPRESSION_KEEP_RECENT ?? String(DEFAULT_CONFIG.keepRecent),
      10,
    ),
    maxSummaryTokens: parseInt(
      process.env.CW_COMPRESSION_MAX_SUMMARY ?? String(DEFAULT_CONFIG.maxSummaryTokens),
      10,
    ),
    enabled: process.env.CW_COMPRESSION_DISABLED !== "true",
  };
}

// ── Token Estimation ─────────────────────────────────────────────────

function estimateMessageTokens(msg: EngineMessage): number {
  const text = msg.content
    .map((p) => ("text" in p ? p.text : "[tool]"))
    .join("\n");
  return Math.ceil(text.length / 3.5); // ~3.5 chars per token
}

function totalTokens(messages: EngineMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

// ── Compressor ───────────────────────────────────────────────────────

/**
 * Check if a thread needs compression and run it if so.
 * Returns the compression result or null if no compression was needed.
 *
 * This should be called fire-and-forget after each agent turn.
 */
export async function maybeCompressThread(
  threadId: string,
  messages: EngineMessage[],
  ownerEmail?: string,
): Promise<CompressionResult | null> {
  const config = loadCompressionConfig();

  if (!config.enabled || !threadId || !ownerEmail) {
    return null;
  }

  const originalTokens = totalTokens(messages);

  // Don't compress if under threshold
  if (originalTokens <= config.threshold) {
    return {
      threadId,
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      savingsPercent: 0,
      keptRecentMessages: messages.length,
    };
  }

  try {
    // Delegate to the framework's Observational Memory compactor
    const { maybeCompactThread } = await import(
      "@agent-native/core/agent/observational-memory/index"
    );

    const result = await maybeCompactThread({
      threadId,
      ownerEmail,
      messages,
    });

    // Calculate actual tokens after compression
    const recentMessages = messages.slice(-config.keepRecent);
    const compressedTokens = totalTokens(recentMessages) +
      (result.observer.observed
        ? Math.min(result.observer.unobservedTokens, config.maxSummaryTokens)
        : 0);

    return {
      threadId,
      compressed: result.observer.observed || result.reflector.reflected,
      originalTokens,
      compressedTokens,
      savingsPercent: Math.round(
        ((originalTokens - compressedTokens) / originalTokens) * 100,
      ),
      keptRecentMessages: config.keepRecent,
    };
  } catch (error) {
    console.warn("[context-compressor] Compression failed:", error);
    return {
      threadId,
      compressed: false,
      originalTokens,
      compressedTokens: originalTokens,
      savingsPercent: 0,
      keptRecentMessages: messages.length,
      error: String(error),
    };
  }
}

/**
 * Get compression statistics for logging/monitoring.
 */
export async function getCompressionStats(
  threadId: string,
  messages: EngineMessage[],
): Promise<{ totalTokens: number; shouldCompress: boolean }> {
  const config = loadCompressionConfig();
  const tokens = totalTokens(messages);

  return {
    totalTokens: tokens,
    shouldCompress: tokens > config.threshold,
  };
}

/**
 * Format compression result for logging/debugging.
 */
export function formatCompressionResult(result: CompressionResult): string {
  if (!result.compressed) {
    return `[compressor] Thread ${result.threadId}: ${result.originalTokens} tokens — below threshold, skipped`;
  }
  return `[compressor] Thread ${result.threadId}: ${result.originalTokens} → ${result.compressedTokens} tokens (${result.savingsPercent}% saved, ${result.keptRecentMessages} recent kept)`;
}
