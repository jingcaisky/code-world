/**
 * Plan Routes Plugin — Layer 2
 *
 * Nitro plugin providing Plan confirmation and execution API routes.
 * Exposes SSE endpoints for the plan generation and execution lifecycle.
 *
 * Routes:
 *   POST /_agent-native/plan/confirm  — User confirms/modifies/cancels a plan
 *   GET  /_agent-native/plan/stream    — SSE stream for plan execution progress
 *   GET  /_agent-native/plan/:id       — Get plan status
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 2
 */

import {
  defineEventHandler,
  getQuery,
  readBody,
  createError,
  setResponseStatus,
  setResponseHeaders,
} from "h3";

import {
  getPlan,
  updatePlanStatus,
  updateSubTask,
  allSubTasksReady,
  formatPlanForUser,
  type PlanConfirmation,
} from "../lib/plan-engine";

// ── Types ─────────────────────────────────────────────────────────────

interface ConfirmBody {
  planId: string;
  action: PlanConfirmation;
  feedback?: string;
  modifications?: Record<string, string>;
}

interface SSEProgressEvent {
  type:
    | "plan_generated"
    | "sub_task_started"
    | "sub_task_completed"
    | "sub_task_failed"
    | "review_started"
    | "review_completed"
    | "plan_completed"
    | "plan_failed"
    | "plan_cancelled";
  planId: string;
  subTaskId?: string;
  data?: unknown;
}

// ── SSE Helpers ───────────────────────────────────────────────────────

function sendSSE(
  event: SSEProgressEvent,
): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ── POST /_agent-native/plan/confirm ──────────────────────────────────

export const planConfirmHandler = defineEventHandler(async (event) => {
  const body = await readBody<ConfirmBody>(event);

  if (!body?.planId || !body?.action) {
    throw createError({
      statusCode: 400,
      message: "planId and action are required",
    });
  }

  const plan = getPlan(body.planId);
  if (!plan) {
    throw createError({
      statusCode: 404,
      message: `Plan ${body.planId} not found`,
    });
  }

  switch (body.action) {
    case "confirm":
      updatePlanStatus(body.planId, "executing");
      return {
        planId: body.planId,
        status: "executing",
        message: "Plan confirmed. Execution started.",
        subTasks: plan.subTasks.map((st) => ({
          id: st.id,
          agent: st.agent,
          status: st.status,
        })),
      };

    case "modify":
      updatePlanStatus(body.planId, "awaiting_confirmation", body.feedback);
      return {
        planId: body.planId,
        status: "awaiting_confirmation",
        feedback: body.feedback,
        message: "Plan modifications received. Regenerating...",
      };

    case "cancel":
      updatePlanStatus(body.planId, "cancelled");
      return {
        planId: body.planId,
        status: "cancelled",
        message: "Plan execution cancelled.",
      };

    default:
      throw createError({
        statusCode: 400,
        message: `Invalid action: ${body.action}`,
      });
  }
});

// ── GET /_agent-native/plan/stream ────────────────────────────────────

export const planStreamHandler = defineEventHandler(async (event) => {
  const query = getQuery(event);
  const planId = query.planId as string;

  if (!planId) {
    throw createError({
      statusCode: 400,
      message: "planId query parameter is required",
    });
  }

  // Set SSE headers
  setResponseHeaders(event, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Get plan
  const plan = getPlan(planId);
  if (!plan) {
    setResponseStatus(event, 404);
    return sendSSE({ type: "plan_failed", planId, data: "Plan not found" });
  }

  // Send initial plan state
  const initialEvent: SSEProgressEvent = {
    type: "plan_generated",
    planId: plan.planId,
    data: {
      taskType: plan.taskType,
      scope: plan.scope,
      subTaskCount: plan.subTasks.length,
      formattedPlan: formatPlanForUser(plan),
    },
  };

  return sendSSE(initialEvent);
});

// ── GET /_agent-native/plan/:id ───────────────────────────────────────

export const planStatusHandler = defineEventHandler(async (event) => {
  const planId = event.context.params?.id as string;

  if (!planId) {
    throw createError({
      statusCode: 400,
      message: "plan ID is required",
    });
  }

  const plan = getPlan(planId);
  if (!plan) {
    throw createError({
      statusCode: 404,
      message: `Plan ${planId} not found`,
    });
  }

  return {
    planId: plan.planId,
    taskType: plan.taskType,
    scope: plan.scope,
    status: plan.status,
    estimatedComplexity: plan.estimatedComplexity,
    estimatedFiles: plan.estimatedFiles,
    estimatedTokens: plan.estimatedTokens,
    createdAt: plan.createdAt,
    subTasks: plan.subTasks.map((st) => ({
      id: st.id,
      description: st.description,
      agent: st.agent,
      status: st.status,
      deps: st.deps,
      fileTargets: st.fileTargets,
      error: st.error,
    })),
  };
});

// ── Plugin Export ─────────────────────────────────────────────────────

/**
 * Register plan routes on a Nitro app.
 */
export function registerPlanRoutes(nitroApp: any): void {
  const router = nitroApp.router ?? nitroApp;

  router.post("/_agent-native/plan/confirm", planConfirmHandler);
  router.get("/_agent-native/plan/stream", planStreamHandler);
  router.get("/_agent-native/plan/:id", planStatusHandler);
}
