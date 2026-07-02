/**
 * Progress Emitter — SSE streaming across all layers
 *
 * Provides a unified event bus for streaming architecture progress
 * to the frontend via Server-Sent Events.
 *
 * Events are typed and layer-scoped, consumed by the frontend
 * to show "正在检索..." / "分析复杂度..." / "生成计划..." etc.
 *
 * Part of: Integration Plan Phase 2.3
 */

import type { TokenBudget } from "./token-budget";
import type { SearchStatus } from "./search-orchestrator";
import type { TriageResult } from "./triage-service";
import type { PlanManifest } from "./plan-engine";
import type { SubAgentOutput } from "./sub-agent-runner";
import type { ReviewResult } from "./review-checker";
import type { ChangeReport } from "./change-reporter";
import type { MemoryWriteResult } from "./memory-writer";

// ── Event Types ───────────────────────────────────────────────────────

/** All possible progress events */
export type ProgressEvent =
  // Layer 0: Context Assembly
  | { layer: 0; status: "context_assembled"; budget: TokenBudget }
  | { layer: 0; status: "context_truncated"; truncated: string[] }
  // Layer 1: Search + Triage
  | { layer: 1; status: "searching"; channels: SearchStatus }
  | { layer: 1; status: "search_complete"; resultsCount: number; latencyMs: number }
  | { layer: 1; status: "triaging" }
  | { layer: 1; status: "triaged"; result: TriageResult }
  // Layer 2: Plan Generation
  | { layer: 2; status: "planning" }
  | { layer: 2; status: "plan_generated"; plan: PlanManifest }
  | { layer: 2; status: "awaiting_confirmation" }
  | { layer: 2; status: "plan_confirmed" }
  | { layer: 2; status: "plan_cancelled" }
  // Layer 3: Sub-Agent Execution
  | { layer: 3; status: "executing"; subTaskId: string; agent: string; progress: string }
  | { layer: 3; status: "sub_task_completed"; output: SubAgentOutput }
  | { layer: 3; status: "reviewing" }
  | { layer: 3; status: "review_completed"; result: ReviewResult }
  // Layer 4: Integration
  | { layer: 4; status: "generating_report" }
  | { layer: 4; status: "report_generated"; report: ChangeReport }
  | { layer: 4; status: "consolidating_memory" }
  | { layer: 4; status: "memory_consolidated"; memoryResult: MemoryWriteResult }
  // Terminal
  | { type: "error"; layer?: number; message: string }
  | { type: "done" };

// ── Event Emitter ─────────────────────────────────────────────────────

export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Create a progress callback that sends events to a function.
 * Wrap this in an SSE writer for HTTP streaming.
 */
export function createProgressEmitter(
  onEvent: ProgressCallback,
): {
  /** Emit a context assembly event */
  contextAssembled: (budget: TokenBudget) => void;
  contextTruncated: (truncated: string[]) => void;
  /** Emit a search event */
  searchStarted: (channels: SearchStatus) => void;
  searchComplete: (resultsCount: number, latencyMs: number) => void;
  /** Emit a triage event */
  triageStarted: () => void;
  triageComplete: (result: TriageResult) => void;
  /** Emit a plan event */
  planStarted: () => void;
  planGenerated: (plan: PlanManifest) => void;
  planAwaitingConfirmation: () => void;
  planConfirmed: () => void;
  planCancelled: () => void;
  /** Emit a sub-agent event */
  subTaskStarted: (subTaskId: string, agent: string, progress: string) => void;
  subTaskCompleted: (output: SubAgentOutput) => void;
  /** Emit a review event */
  reviewStarted: () => void;
  reviewCompleted: (result: ReviewResult) => void;
  /** Emit a report event */
  reportStarted: () => void;
  reportGenerated: (report: ChangeReport) => void;
  /** Emit a memory event */
  memoryStarted: () => void;
  memoryConsolidated: (memoryResult: MemoryWriteResult) => void;
  /** Emit terminal events */
  error: (message: string, layer?: number) => void;
  done: () => void;
} {
  return {
    contextAssembled: (budget) =>
      onEvent({ layer: 0, status: "context_assembled", budget }),
    contextTruncated: (truncated) =>
      onEvent({ layer: 0, status: "context_truncated", truncated }),

    searchStarted: (channels) =>
      onEvent({ layer: 1, status: "searching", channels }),
    searchComplete: (resultsCount, latencyMs) =>
      onEvent({ layer: 1, status: "search_complete", resultsCount, latencyMs }),

    triageStarted: () => onEvent({ layer: 1, status: "triaging" }),
    triageComplete: (result) =>
      onEvent({ layer: 1, status: "triaged", result }),

    planStarted: () => onEvent({ layer: 2, status: "planning" }),
    planGenerated: (plan) =>
      onEvent({ layer: 2, status: "plan_generated", plan }),
    planAwaitingConfirmation: () =>
      onEvent({ layer: 2, status: "awaiting_confirmation" }),
    planConfirmed: () => onEvent({ layer: 2, status: "plan_confirmed" }),
    planCancelled: () => onEvent({ layer: 2, status: "plan_cancelled" }),

    subTaskStarted: (subTaskId, agent, progress) =>
      onEvent({ layer: 3, status: "executing", subTaskId, agent, progress }),
    subTaskCompleted: (output) =>
      onEvent({ layer: 3, status: "sub_task_completed", output }),

    reviewStarted: () => onEvent({ layer: 3, status: "reviewing" }),
    reviewCompleted: (result) =>
      onEvent({ layer: 3, status: "review_completed", result }),

    reportStarted: () => onEvent({ layer: 4, status: "generating_report" }),
    reportGenerated: (report) =>
      onEvent({ layer: 4, status: "report_generated", report }),

    memoryStarted: () =>
      onEvent({ layer: 4, status: "consolidating_memory" }),
    memoryConsolidated: (memoryResult) =>
      onEvent({ layer: 4, status: "memory_consolidated", memoryResult }),

    error: (message, layer) => onEvent({ type: "error", layer, message }),
    done: () => onEvent({ type: "done" }),
  };
}

/**
 * Create an SSE response writer that emits progress events.
 * Use in a Nitro event handler:
 *
 * ```ts
 * const writer = createSSEWriter(event);
 * const progress = createProgressEmitter((e) => writer.write(e));
 * ```
 */
export function createSSEWriter(
  event: any,
): {
  write: (event: ProgressEvent) => void;
  end: () => void;
} {
  // Set SSE headers
  if (event.node?.res) {
    event.node.res.setHeader("Content-Type", "text/event-stream");
    event.node.res.setHeader("Cache-Control", "no-cache");
    event.node.res.setHeader("Connection", "keep-alive");
    event.node.res.setHeader("X-Accel-Buffering", "no");
  }

  return {
    write: (e: ProgressEvent) => {
      if (event.node?.res) {
        event.node.res.write(`data: ${JSON.stringify(e)}\n\n`);
      }
    },
    end: () => {
      if (event.node?.res) {
        event.node.res.end();
      }
    },
  };
}

/**
 * Create a no-op progress callback for when SSE is not available.
 */
export function createNoopProgress() {
  const noop = () => {};
  return createProgressEmitter(noop);
}
