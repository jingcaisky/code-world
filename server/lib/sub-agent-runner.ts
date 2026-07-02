/**
 * Sub-Agent Runner — Layer 3
 *
 * Orchestrates parallel sub-agent execution with dependency-aware scheduling.
 * Each sub-agent runs independently and concurrently where possible.
 * The review agent runs last after all other agents complete.
 *
 * Key behaviors:
 * - Respects sub-task dependency graph (deps must complete first)
 * - Runs independent sub-tasks in parallel
 * - Collects outputs and feeds to the review agent
 * - Reports progress via event bus
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 3
 */

import type { SubTask, PlanManifest } from "./plan-engine";
import {
  updateSubTask,
  allSubTasksReady,
} from "./plan-engine";

// ── Types ─────────────────────────────────────────────────────────────

export interface SubAgentContext {
  planId: string;
  subTask: SubTask;
  context: string; // Assembled context from Layer 0 + search results
  previousOutputs: Record<string, string>; // Outputs from completed deps
}

export interface SubAgentOutput {
  subTaskId: string;
  success: boolean;
  output?: string;
  error?: string;
  filesCreated?: string[];
  filesModified?: Array<{ path: string; added: number; removed: number }>;
}

export type AgentExecutor = (ctx: SubAgentContext) => Promise<SubAgentOutput>;

// ── Dependency Scheduler ──────────────────────────────────────────────

/**
 * Resolve sub-tasks into execution batches based on dependencies.
 * Each batch contains tasks that can run in parallel.
 */
export function scheduleBatches(subTasks: SubTask[]): SubTask[][] {
  const completed = new Set<string>();
  const remaining = [...subTasks];
  const batches: SubTask[][] = [];

  while (remaining.length > 0) {
    const batch: SubTask[] = [];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const task = remaining[i];
      const depsReady = task.deps.every((depId) => completed.has(depId));

      if (depsReady) {
        batch.push(task);
        remaining.splice(i, 1);
      }
    }

    if (batch.length === 0 && remaining.length > 0) {
      // Circular dependency or all remaining have unsatisfied deps
      break;
    }

    batches.push(batch);

    // Mark batch as "completed" for next iteration
    for (const task of batch) {
      completed.add(task.id);
    }
  }

  // Add any remaining tasks that couldn't be resolved
  if (remaining.length > 0) {
    batches.push(remaining);
  }

  return batches;
}

// ── Agent Executor Factory ─────────────────────────────────────────────

/**
 * Create a default agent executor that calls the agent via A2A/call-agent.
 */
export function createDefaultExecutor(
  apiBase: string = "http://localhost:8080",
): AgentExecutor {
  return async (ctx: SubAgentContext): Promise<SubAgentOutput> => {
    try {
      // Build context string for the sub-agent
      const depsContext =
        Object.keys(ctx.previousOutputs).length > 0
          ? `\n\nPrevious outputs from dependent tasks:\n${Object.entries(ctx.previousOutputs)
              .map(([id, output]) => `[${id}]: ${output.slice(0, 500)}`)
              .join("\n")}`
          : "";

      const prompt = `Task: ${ctx.subTask.description}

Expected output: ${ctx.subTask.expected}

Files to target: ${ctx.subTask.fileTargets.join(", ") || "determine from context"}

${ctx.context}${depsContext}

Complete this sub-task and return the output.`;

      // Call the agent via A2A protocol
      const response = await fetch(`${apiBase}/_agent-native/a2a`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          agent: ctx.subTask.agent,
          planId: ctx.planId,
        }),
      });

      if (!response.ok) {
        return {
          subTaskId: ctx.subTask.id,
          success: false,
          error: `Agent ${ctx.subTask.agent} returned ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        subTaskId: ctx.subTask.id,
        success: true,
        output: data.response ?? data.text ?? JSON.stringify(data),
        filesCreated: data.filesCreated ?? [],
        filesModified: data.filesModified ?? [],
      };
    } catch (error) {
      return {
        subTaskId: ctx.subTask.id,
        success: false,
        error: String(error),
      };
    }
  };
}

// ── Runner Callbacks ──────────────────────────────────────────────────

export interface RunnerCallbacks {
  /** Called when a sub-task starts */
  onSubTaskStart?(subTaskId: string, agent: string): void;
  /** Called when a sub-task completes */
  onSubTaskComplete?(output: SubAgentOutput): void;
  /** Called when a batch completes */
  onBatchComplete?(batchIndex: number, outputs: SubAgentOutput[]): void;
  /** Called when all sub-tasks complete */
  onAllComplete?(outputs: SubAgentOutput[]): void;
  /** Called when a sub-task fails */
  onSubTaskError?(subTaskId: string, error: string): void;
}

// ── Main Runner ────────────────────────────────────────────────────────

/**
 * Execute all sub-tasks in a plan according to their dependency graph.
 *
 * Execution order:
 * 1. Schedule into dependency-respecting batches
 * 2. Run each batch in parallel
 * 3. Collect outputs and feed to dependent tasks
 * 4. Run review agent last
 */
export async function runSubAgents(
  plan: PlanManifest,
  executor: AgentExecutor,
  context: string,
  callbacks?: RunnerCallbacks,
): Promise<SubAgentOutput[]> {
  const allOutputs: SubAgentOutput[] = [];
  const outputMap = new Map<string, SubAgentOutput>();

  // Separate review agent from regular sub-tasks
  const execTasks = plan.subTasks.filter(
    (st) => st.agent !== "code-reviewer",
  );
  const reviewTask = plan.subTasks.find(
    (st) => st.agent === "code-reviewer",
  );

  // Schedule into batches
  const batches = scheduleBatches(execTasks);

  // Execute each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    // Build context for each task in the batch
    const batchPromises = batch.map(async (subTask) => {
      // Collect outputs from completed dependencies
      const depsOutputs: Record<string, string> = {};
      for (const depId of subTask.depts) {
        const depOutput = outputMap.get(depId);
        if (depOutput?.output) {
          depsOutputs[depId] = depOutput.output;
        }
      }

      // Mark as running
      updateSubTask(plan.planId, subTask.id, { status: "running" });
      callbacks?.onSubTaskStart?.(subTask.id, subTask.agent);

      // Execute
      const ctx: SubAgentContext = {
        planId: plan.planId,
        subTask,
        context,
        previousOutputs: depsOutputs,
      };

      const output = await executor(ctx);

      // Update status
      updateSubTask(plan.planId, subTask.id, {
        status: output.success ? "completed" : "failed",
        output: output.output,
        error: output.error,
      });

      if (output.success) {
        callbacks?.onSubTaskComplete?.(output);
      } else {
        callbacks?.onSubTaskError?.(subTask.id, output.error ?? "Unknown error");
      }

      return output;
    });

    // Wait for all tasks in this batch
    const batchOutputs = await Promise.all(batchPromises);

    // Record outputs
    for (const output of batchOutputs) {
      outputMap.set(output.subTaskId, output);
      allOutputs.push(output);
    }

    callbacks?.onBatchComplete?.(batchIndex, batchOutputs);
  }

  // Run review agent last
  if (reviewTask) {
    const reviewCtx: SubAgentContext = {
      planId: plan.planId,
      subTask: reviewTask,
      context: `
Review the following outputs from sub-task execution:

${allOutputs
  .map(
    (o) =>
      `### ${o.subTaskId}: ${o.success ? "SUCCESS" : "FAILED"}
${o.output ?? `Error: ${o.error}`}`,
  )
  .join("\n\n---\n\n")}`,
      previousOutputs: Object.fromEntries(
        allOutputs.map((o) => [o.subTaskId, o.output ?? ""]),
      ),
    };

    callbacks?.onSubTaskStart?.(reviewTask.id, reviewTask.agent);
    const reviewOutput = await executor(reviewCtx);
    updateSubTask(plan.planId, reviewTask.id, {
      status: reviewOutput.success ? "completed" : "failed",
      output: reviewOutput.output,
      error: reviewOutput.error,
    });

    callbacks?.onSubTaskComplete?.(reviewOutput);
    allOutputs.push(reviewOutput);
    outputMap.set(reviewTask.id, reviewOutput);
  }

  callbacks?.onAllComplete?.(allOutputs);
  return allOutputs;
}

/**
 * Collect all file changes from sub-agent outputs for the change report.
 */
export function collectFileChanges(
  outputs: SubAgentOutput[],
): { created: string[]; modified: Array<{ path: string; added: number; removed: number }> } {
  const created: string[] = [];
  const modified: Array<{ path: string; added: number; removed: number }> = [];

  for (const output of outputs) {
    if (output.filesCreated) created.push(...output.filesCreated);
    if (output.filesModified) modified.push(...output.filesModified);
  }

  return { created, modified };
}
