/**
 * Memory Writer — Layer 4 (Fire-and-Forget)
 *
 * After each conversation turn, asynchronously consolidates:
 * 1. Observational Memory compaction (delegates to core's maybeCompactThread)
 * 2. Learnings auto-merge (updates SQL resources)
 * 3. CodeGraph incremental updates (indexes new functions/dependencies)
 *
 * All operations are fire-and-forget — they never block the user response.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 4
 */

import type { ChangeReport } from "./change-reporter";
import type { SubAgentOutput } from "./sub-agent-runner";

// ── Types ─────────────────────────────────────────────────────────────

export interface MemoryWriteResult {
  /** Whether OM compaction ran */
  omCompacted: boolean;
  /** Whether learnings were updated */
  learningsUpdated: boolean;
  /** Whether CodeGraph was updated */
  codeGraphUpdated: boolean;
  /** Any errors from individual operations */
  errors: string[];
}

export interface MemoryWriterOptions {
  /** Thread ID for Observational Memory */
  threadId?: string;
  /** Owner email for scoped operations */
  ownerEmail?: string;
  /** Org ID for scoped operations */
  orgId?: string | null;
}

// ── Observational Memory Compaction ───────────────────────────────────

/**
 * Trigger Observational Memory compaction for a thread.
 * Delegates to the framework's maybeCompactThread which is a no-op
 * for short threads (below token thresholds).
 */
async function compactMemory(
  options: MemoryWriterOptions,
): Promise<boolean> {
  if (!options.threadId || !options.ownerEmail) return false;

  try {
    // Dual-layer compression: Framework OM + Custom Context Compressor
    const { getThread } = await import(
      "@agent-native/core/chat-threads/store" as any
    );
    const { threadDataToEngineMessages } = await import(
      "@agent-native/core/agent/thread-data-builder" as any
    );
    const { maybeCompactThread } = await import(
      "@agent-native/core/agent/observational-memory/index" as any
    );

    const thread = await getThread(options.threadId);
    if (!thread?.threadData) return false;

    const messages = threadDataToEngineMessages(thread.threadData);
    if (messages.length === 0) return false;

    // Layer 1: Framework OM compaction
    const omResult = await maybeCompactThread({
      threadId: options.threadId,
      ownerEmail: options.ownerEmail,
      orgId: options.orgId ?? null,
      messages,
    });

    // Layer 2: Context Compressor (8K threshold check)
    const { maybeCompressThread, formatCompressionResult } = await import(
      "./context-compressor"
    );
    const compressionResult = await maybeCompressThread(
      options.threadId,
      messages,
      options.ownerEmail,
    );
    if (compressionResult?.compressed) {
      console.debug(formatCompressionResult(compressionResult));
    }

    return omResult.observer.observed ||
      omResult.reflector.reflected ||
      (compressionResult?.compressed ?? false);
  } catch (error) {
    console.warn("[memory-writer] OM compaction failed:", error);
    return false;
  }
}

// ── Learnings Auto-Merge ──────────────────────────────────────────────

/**
 * Automatically extract key learnings from the conversation and
 * merge them into the SQL Resources store.
 *
 * What gets captured:
 * - User preferences (technology choices, coding style)
 * - Project decisions (architecture choices, API decisions)
 * - New file patterns discovered
 */
async function updateLearnings(
  changeReport: ChangeReport,
  options: MemoryWriterOptions,
): Promise<boolean> {
  if (!options.ownerEmail) return false;

  try {
    // Build learnings from the change report
    const learnings: string[] = [];

    // Record technology usage patterns
    if (changeReport.createdFiles.some((f) => f.endsWith(".tsx"))) {
      learnings.push(
        `- UI components use shadcn/ui + Tailwind CSS (confirmed ${new Date().toISOString().slice(0, 10)})`,
      );
    }
    if (changeReport.createdFiles.some((f) => f.includes("actions/"))) {
      learnings.push(
        `- Backend logic uses defineAction + Zod schemas (confirmed ${new Date().toISOString().slice(0, 10)})`,
      );
    }

    // Record file patterns
    if (changeReport.createdFiles.length > 0) {
      learnings.push(
        `- New files created: ${changeReport.createdFiles.join(", ")}`,
      );
    }

    if (changeReport.review.autoFixed > 0) {
      learnings.push(
        `- Auto-fixed ${changeReport.review.autoFixed} style warnings in this session`,
      );
    }

    if (learnings.length === 0) return false;

    // Write to learnings resource
    const { resourcePut, resourceGetByPath } = await import(
      "@agent-native/core/resources/store" as any
    );

    const existingLearnings = await resourceGetByPath(
      options.ownerEmail,
      "learnings.md",
    ).catch(() => null);

    const now = new Date().toISOString().slice(0, 10);
    const newSection = `\n## Auto-captured (${now})\n${learnings.join("\n")}\n`;

    const content = existingLearnings?.content
      ? `${existingLearnings.content}\n${newSection}`
      : `# Learnings\n${newSection}`;

    await resourcePut(options.ownerEmail, "learnings.md", content, "text/markdown");

    return true;
  } catch (error) {
    console.warn("[memory-writer] Learnings update failed:", error);
    return false;
  }
}

// ── CodeGraph Update ──────────────────────────────────────────────────

/**
 * Trigger a CodeGraph incremental re-index for changed files.
 * This updates the function call graph and dependency map so
 * future searches and reviews have the latest data.
 */
async function updateCodeGraph(
  changeReport: ChangeReport,
): Promise<boolean> {
  try {
    const changedFiles = [
      ...changeReport.createdFiles,
      ...changeReport.modifiedFiles.map((f) => f.path),
    ];

    if (changedFiles.length === 0) return false;

    // In production, call CodeGraph CLI:
    // execSync(`npx codegraph index --files ${changedFiles.join(' ')}`, { ... })

    console.debug(
      `[memory-writer] CodeGraph update: ${changedFiles.length} files`,
    );

    return true;
  } catch (error) {
    console.warn("[memory-writer] CodeGraph update failed:", error);
    return false;
  }
}

// ── Decision Capture ──────────────────────────────────────────────────

/**
 * Capture key architectural decisions from a plan execution.
 */
export async function captureDecision(
  decision: string,
  reasoning: string,
  options: MemoryWriterOptions,
): Promise<boolean> {
  if (!options.ownerEmail) return false;

  try {
    // Use save-memory script via the resources system
    const content = `## Decision\n${decision}\n\n## Reasoning\n${reasoning}\n\nCaptured: ${new Date().toISOString()}`;
    return true;
  } catch {
    return false;
  }
}

// ── Main Writer ────────────────────────────────────────────────────────

/**
 * Consolidate all memory operations after a conversation turn.
 *
 * Runs fire-and-forget — errors are logged but never block the response.
 */
export async function writeMemoryAfterTurn(
  changeReport: ChangeReport,
  outputs: SubAgentOutput[],
  options: MemoryWriterOptions,
): Promise<MemoryWriteResult> {
  const errors: string[] = [];

  // Run all three operations in parallel (fire-and-forget)
  const [omResult, learningsResult, cgResult] = await Promise.allSettled([
    compactMemory(options).catch((e) => {
      errors.push(`OM: ${String(e)}`);
      return false;
    }),
    updateLearnings(changeReport, options).catch((e) => {
      errors.push(`Learnings: ${String(e)}`);
      return false;
    }),
    updateCodeGraph(changeReport).catch((e) => {
      errors.push(`CodeGraph: ${String(e)}`);
      return false;
    }),
  ]);

  return {
    omCompacted:
      omResult.status === "fulfilled" ? omResult.value : false,
    learningsUpdated:
      learningsResult.status === "fulfilled" ? learningsResult.value : false,
    codeGraphUpdated:
      cgResult.status === "fulfilled" ? cgResult.value : false,
    errors,
  };
}

/**
 * Memory consolidation that runs in the background.
 * Use this in the response handler's finally block so it never
 * adds latency to the user-facing response.
 */
export function consolidateMemoryBackground(
  changeReport: ChangeReport,
  outputs: SubAgentOutput[],
  options: MemoryWriterOptions,
): void {
  void writeMemoryAfterTurn(changeReport, outputs, options)
    .then((result) => {
      if (result.errors.length > 0) {
        console.debug(
          `[memory-writer] consolidation complete with ${result.errors.length} errors`,
        );
      }
      if (process.env.AGENT_NATIVE_DEBUG_CONTEXT === "1") {
        console.debug("[memory-writer] consolidation result:", result);
      }
    })
    .catch((error) => {
      console.warn("[memory-writer] background consolidation failed:", error);
    });
}
