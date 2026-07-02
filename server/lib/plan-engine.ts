/**
 * Plan Engine — Layer 2
 *
 * Main model orchestration engine that:
 * 1. Receives triage result + context from Layer 1
 * 2. Generates a structured execution plan
 * 3. Manages user confirmation flow
 * 4. Dispatches sub-tasks to agents
 *
 * The main model only makes decisions — it never writes code directly.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 2
 */

import { SUB_AGENTS } from "../../config/const";
import type { PlanSuggestion, TriageResult } from "./triage-service";
import type { ContextBlock } from "./context-assembler";

// ── Types ─────────────────────────────────────────────────────────────

export type TaskType = "fix" | "create" | "refactor" | "investigate";
export type TaskScope = "frontend" | "backend" | "fullstack" | "config";
export type TaskComplexity = "low" | "medium" | "high";
export type SubTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface SubTask {
  /** Unique task identifier */
  id: string;
  /** Human-readable description of what to do */
  description: string;
  /** Target sub-agent name */
  agent: keyof typeof SUB_AGENTS;
  /** Dependencies: IDs of sub-tasks that must complete first */
  deps: string[];
  /** Expected output description */
  expected: string;
  /** Files this sub-task will create or modify */
  fileTargets: string[];
  /** Execution status */
  status: SubTaskStatus;
  /** Actual output after execution */
  output?: string;
  /** Error message if failed */
  error?: string;
}

export interface PlanManifest {
  /** Unique plan identifier */
  planId: string;
  /** Overall task type */
  taskType: TaskType;
  /** Affected scope */
  scope: TaskScope;
  /** Estimated complexity */
  estimatedComplexity: TaskComplexity;
  /** Ordered sub-tasks with dependencies */
  subTasks: SubTask[];
  /** Checklist for the review agent */
  reviewChecklist: string[];
  /** Estimated number of files to touch */
  estimatedFiles: number;
  /** Estimated token cost for execution */
  estimatedTokens: number;
  /** Plan creation timestamp */
  createdAt: number;
  /** Plan status */
  status: "awaiting_confirmation" | "executing" | "executed" | "cancelled";
  /** User feedback on the plan (modifications requested) */
  userFeedback?: string;
}

/** User's response to a plan */
export type PlanConfirmation = "confirm" | "modify" | "cancel";

// ── Plan Generator ────────────────────────────────────────────────────

/**
 * Generate a structured execution plan from a triage result.
 *
 * This is called by the main model to produce a plan. The main model
 * should use the plan_suggestion from Layer 1 as a starting point
 * and refine it with full context.
 */
export function generatePlan(
  triage: TriageResult,
  context: ContextBlock,
  options?: {
    userMessage?: string;
    previousPlanId?: string;
  },
): PlanManifest {
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const suggestion = triage.planSuggestion;

  // Map task type
  const taskType: TaskType = suggestion?.taskType ?? "create";
  const scope: TaskScope = suggestion?.scope ?? "fullstack";
  const complexity: TaskComplexity =
    suggestion?.estimatedComplexity ?? "medium";

  // Build sub-tasks based on scope and task type
  const subTasks = buildSubTasks(taskType, scope, suggestion);

  // Build review checklist
  const reviewChecklist = buildReviewChecklist(taskType, scope);

  // Estimate files
  const estimatedFiles = subTasks.length * 1.5;

  // Estimate tokens (rough: 2K per sub-task for execution)
  const estimatedTokens = subTasks.length * 2_000;

  return {
    planId,
    taskType,
    scope,
    estimatedComplexity: complexity,
    subTasks,
    reviewChecklist,
    estimatedFiles: Math.ceil(estimatedFiles),
    estimatedTokens,
    createdAt: Date.now(),
    status: "awaiting_confirmation",
  };
}

// ── Sub-Task Builder ──────────────────────────────────────────────────

function buildSubTasks(
  taskType: TaskType,
  scope: TaskScope,
  suggestion?: PlanSuggestion | null,
): SubTask[] {
  const tasks: SubTask[] = [];
  let counter = 0;

  function nextId(): string {
    counter++;
    return `st-${counter}`;
  }

  const files = suggestion?.keyFilesInvolved ?? [];

  // Frontend tasks
  if (scope === "frontend" || scope === "fullstack") {
    if (taskType === "create") {
      tasks.push({
        id: nextId(),
        description: "Create new React component(s) with shadcn/ui styling",
        agent: "frontend-designer",
        deps: [],
        expected: "Working React components with proper Tailwind CSS classes",
        fileTargets: files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx")),
        status: "pending",
      });
    } else if (taskType === "fix") {
      tasks.push({
        id: nextId(),
        description: "Fix UI bugs and update component styling",
        agent: "frontend-designer",
        deps: [],
        expected: "Corrected components matching design spec",
        fileTargets: files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx")),
        status: "pending",
      });
    } else if (taskType === "refactor") {
      tasks.push({
        id: nextId(),
        description: "Refactor frontend components for improved structure",
        agent: "frontend-designer",
        deps: [],
        expected: "Clean, reusable components with proper separation",
        fileTargets: files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx")),
        status: "pending",
      });
    }
  }

  // Backend tasks
  if (scope === "backend" || scope === "fullstack") {
    const frontendDep =
      scope === "fullstack" ? [tasks[0]?.id].filter(Boolean) : [];

    tasks.push({
      id: nextId(),
      description:
        taskType === "create"
          ? "Create Actions and database schemas"
          : "Update Actions and database logic",
      agent: "backend-creator",
      deps: frontendDep,
      expected: "Working defineAction exports with Zod schemas",
      fileTargets: files.filter((f) => f.endsWith(".ts") && !f.endsWith(".tsx")),
      status: "pending",
    });
  }

  // Test tasks (always add for create/fix/refactor)
  if (taskType !== "investigate") {
    const allDeps = tasks.map((t) => t.id);

    tasks.push({
      id: nextId(),
      description: "Write unit tests for the changes",
      agent: "test-writer",
      deps: allDeps,
      expected: "Passing vitest tests with adequate coverage",
      fileTargets: [],
      status: "pending",
    });
  }

  // Review tasks (always last)
  {
    const allDeps = tasks.map((t) => t.id);

    tasks.push({
      id: nextId(),
      description: "Review all changes for type safety, style, and correctness",
      agent: "code-reviewer",
      deps: allDeps,
      expected: "Review report with critical/warning/suggestion grades",
      fileTargets: [],
      status: "pending",
    });
  }

  return tasks;
}

// ── Review Checklist Builder ──────────────────────────────────────────

function buildReviewChecklist(
  taskType: TaskType,
  scope: TaskScope,
): string[] {
  const checklist: string[] = [
    "TypeScript compilation: no errors",
    "Import paths: correct, no circular deps",
  ];

  if (scope === "frontend" || scope === "fullstack") {
    checklist.push(
      "Components: shadcn/ui primitives used correctly",
      "Styling: semantic tokens (bg-background, text-foreground, etc.)",
      "Icons: @tabler/icons-react only, no lucide-react",
      "Responsive: mobile breakpoints checked",
      "Accessibility: aria-labels, focus states, sr-only titles",
    );
  }

  if (scope === "backend" || scope === "fullstack") {
    checklist.push(
      "Actions: defineAction with Zod schema",
      "SQL: parameterized, dialect-agnostic",
      "Database: additive migrations only",
      "Security: owner-scoped queries, no raw SQL injection",
    );
  }

  if (taskType !== "investigate") {
    checklist.push(
      "Tests: all passing, no skipped tests",
      "Coverage: new code has test coverage",
    );
  }

  checklist.push("No hardcoded secrets or API keys");

  return checklist;
}

// ── Plan Manager ───────────────────────────────────────────────────────

/**
 * In-memory plan store (in production, store in SQL or application_state).
 */
const plans = new Map<string, PlanManifest>();

export function savePlan(plan: PlanManifest): void {
  plans.set(plan.planId, plan);
}

export function getPlan(planId: string): PlanManifest | undefined {
  return plans.get(planId);
}

export function updatePlanStatus(
  planId: string,
  status: PlanManifest["status"],
  userFeedback?: string,
): PlanManifest | null {
  const plan = plans.get(planId);
  if (!plan) return null;
  plan.status = status;
  if (userFeedback) plan.userFeedback = userFeedback;
  return plan;
}

export function updateSubTask(
  planId: string,
  subTaskId: string,
  update: Partial<SubTask>,
): SubTask | null {
  const plan = plans.get(planId);
  if (!plan) return null;
  const subTask = plan.subTasks.find((st) => st.id === subTaskId);
  if (!subTask) return null;
  Object.assign(subTask, update);
  return subTask;
}

/**
 * Check if all non-review sub-tasks are completed.
 */
export function allSubTasksReady(planId: string): boolean {
  const plan = plans.get(planId);
  if (!plan) return false;

  const execTasks = plan.subTasks.filter(
    (st) => st.agent !== "code-reviewer",
  );
  return execTasks.every(
    (st) => st.status === "completed" || st.status === "skipped",
  );
}

// ── Plan Serializer ───────────────────────────────────────────────────

/**
 * Serialize a plan into a human-readable format for user display.
 */
export function formatPlanForUser(plan: PlanManifest): string {
  const lines: string[] = [
    `## 📋 执行计划`,
    ``,
    `**任务类型**: ${plan.taskType}  |  **范围**: ${plan.scope}  |  **复杂度**: ${plan.estimatedComplexity}`,
    `**涉及文件**: ~${plan.estimatedFiles}  |  **预估 Token**: ~${plan.estimatedTokens}`,
    ``,
    `### 子任务`,
  ];

  for (const st of plan.subTasks) {
    const icon =
      st.agent === "code-reviewer"
        ? "🔍"
        : st.agent === "test-writer"
          ? "🧪"
          : st.agent === "frontend-designer"
            ? "🎨"
            : "⚙️";

    const deps =
      st.deps.length > 0
        ? ` (依赖: ${st.deps.join(", ")})`
        : "";

    lines.push(
      `${icon} **${st.id}**: ${st.description} → \`${st.agent}\`${deps}`,
    );

    if (st.fileTargets.length > 0) {
      lines.push(`   文件: ${st.fileTargets.map((f) => `\`${f}\``).join(", ")}`);
    }
  }

  lines.push(``, `### 审查检查项`);
  for (const item of plan.reviewChecklist) {
    lines.push(`- [ ] ${item}`);
  }

  lines.push(``, `---`, `确认执行？ [确认] [修改] [取消]`);

  return lines.join("\n");
}

/**
 * Serialize a plan into a compact prompt for consumption by the main model.
 */
export function serializePlanForModel(plan: PlanManifest): string {
  return JSON.stringify(
    {
      planId: plan.planId,
      taskType: plan.taskType,
      scope: plan.scope,
      subTasks: plan.subTasks.map((st) => ({
        id: st.id,
        desc: st.description,
        agent: st.agent,
        deps: st.deps,
        files: st.fileTargets,
      })),
    },
    null,
    2,
  );
}
