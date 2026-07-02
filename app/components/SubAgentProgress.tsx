/**
 * SubAgentProgress — Layer 3 Progress UI
 *
 * Displays real-time execution status of sub-agents during complex
 * task execution. Receives SSE events from the server and renders
 * a progress card showing each agent's status, progress, and output.
 *
 * System-level capability — UI component, not an Action.
 *
 * Part of: Code World Architecture — System Services (Frontend)
 */

import { IconCheck, IconLoader2, IconClock, IconX, IconChevronDown } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

export type AgentStatus = "pending" | "running" | "success" | "failed";

export interface SubAgentState {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  progress?: number;
  currentStep?: string;
  startedAt?: number;
  finishedAt?: number;
  output?: string;
  error?: string;
}

export interface SubAgentProgressEvent {
  layer: 3;
  status: "executing" | "sub_task_completed";
  subTaskId: string;
  agent?: string;
  progress?: string;
  output?: { subTaskId: string; success: boolean; output?: string; error?: string };
}

// ── Agent name mapping ────────────────────────────────────────────────

const AGENT_NAMES: Record<string, string> = {
  "frontend-designer": "前端生成",
  "backend-creator": "后端生成",
  "test-writer": "测试生成",
  "code-reviewer": "代码审查",
};

const AGENT_ICONS: Record<string, string> = {
  "frontend-designer": "🎨",
  "backend-creator": "⚙️",
  "test-writer": "🧪",
  "code-reviewer": "🔍",
};

// ── Component ─────────────────────────────────────────────────────────

interface SubAgentProgressProps {
  subAgents: SubAgentState[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}

export function SubAgentProgress({
  subAgents,
  isExpanded = true,
  onToggleExpand,
  className,
}: SubAgentProgressProps) {
  const [open, setOpen] = useState(isExpanded);

  // Count agents by status
  const running = subAgents.filter((a) => a.status === "running").length;
  const completed = subAgents.filter((a) => a.status === "success").length;
  const failed = subAgents.filter((a) => a.status === "failed").length;
  const pending = subAgents.filter((a) => a.status === "pending").length;
  const total = subAgents.length;

  // Overall progress
  const overallProgress = total > 0
    ? Math.round(((completed + failed) / total) * 100)
    : 0;

  // Determine overall status text
  let statusText = "准备执行...";
  if (running > 0 && completed > 0) {
    statusText = `${completed}/${total} 已完成，${running} 执行中`;
  } else if (running > 0) {
    statusText = `${running} 个子代理执行中`;
  } else if (failed > 0) {
    statusText = `${failed} 个失败，${completed} 个成功`;
  } else if (completed === total && total > 0) {
    statusText = "全部完成";
  }

  return (
    <Card className={cn("border-border/70 bg-card/80 shadow-sm", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <CollapsibleTrigger
            className="flex flex-1 items-center gap-3 hover:opacity-80"
            onClick={() => onToggleExpand?.()}
          >
            <div className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-background/80">
              <span className="text-base">🤖</span>
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-semibold">
                执行进度
              </CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{statusText}</span>
                {running > 0 && (
                  <Badge variant="secondary" className="h-5 border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-300">
                    执行中
                  </Badge>
                )}
                {failed > 0 && (
                  <Badge variant="secondary" className="h-5 border-red-500/30 bg-red-500/10 text-[10px] text-red-600 dark:text-red-300">
                    {failed} 失败
                  </Badge>
                )}
              </div>
            </div>
            <IconChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pb-4 pt-0">
            {/* Overall progress bar */}
            <Progress value={overallProgress} className="mb-3 h-1.5" />

            {/* Agent list */}
            <div className="grid gap-1.5">
              {subAgents.map((agent) => (
                <AgentRow key={agent.agentId} agent={agent} />
              ))}
            </div>

            {subAgents.length === 0 && (
              <div className="space-y-2 py-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ── Agent Row ─────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: SubAgentState }) {
  const name = AGENT_NAMES[agent.agentId] || agent.agentName || agent.agentId;
  const icon = AGENT_ICONS[agent.agentId] || "📋";

  const statusIcon = {
    pending: <IconClock className="size-3.5 text-muted-foreground" />,
    running: <IconLoader2 className="size-3.5 animate-spin text-blue-500" />,
    success: <IconCheck className="size-3.5 text-emerald-500" />,
    failed: <IconX className="size-3.5 text-red-500" />,
  }[agent.status];

  const statusBg = {
    pending: "bg-muted/50",
    running: "bg-blue-500/5 border-blue-500/20",
    success: "bg-emerald-500/5 border-emerald-500/20",
    failed: "bg-red-500/5 border-red-500/20",
  }[agent.status];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        statusBg,
      )}
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-xs">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {statusIcon}
        </div>
        {agent.currentStep && agent.status === "running" && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {agent.currentStep}
          </p>
        )}
        {agent.error && agent.status === "failed" && (
          <p className="mt-0.5 truncate text-xs text-red-500">
            {agent.error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {agent.status === "running" && agent.progress !== undefined && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {agent.progress}%
          </span>
        )}
        {agent.status === "success" && (
          <Badge
            variant="secondary"
            className="h-5 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-300"
          >
            完成
          </Badge>
        )}
        {agent.status === "pending" && (
          <span className="text-xs text-muted-foreground">等待中</span>
        )}
      </div>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Hook to manage sub-agent progress state from SSE events.
 * Use this in the chat page to track execution progress.
 */
export function useSubAgentProgress() {
  const [subAgents, setSubAgents] = useState<SubAgentState[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Listen for SSE progress events
  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent).detail as SubAgentProgressEvent | undefined;
      if (!detail || detail.layer !== 3) return;

      if (detail.status === "executing") {
        setIsVisible(true);
        setSubAgents((prev) => {
          const existing = prev.find((a) => a.agentId === (detail.agent ?? detail.subTaskId));
          if (existing) {
            return prev.map((a) =>
              a.agentId === (detail.agent ?? detail.subTaskId)
                ? {
                    ...a,
                    status: "running",
                    currentStep: detail.progress,
                    startedAt: a.startedAt ?? Date.now(),
                  }
                : a,
            );
          }
          return [
            ...prev,
            {
              agentId: detail.agent ?? detail.subTaskId,
              agentName: AGENT_NAMES[detail.agent ?? detail.subTaskId] ?? detail.subTaskId,
              status: "running",
              currentStep: detail.progress,
              startedAt: Date.now(),
            },
          ];
        });
      }

      if (detail.status === "sub_task_completed" && detail.output) {
        setSubAgents((prev) =>
          prev.map((a) =>
            a.agentId === detail.output!.subTaskId
              ? {
                  ...a,
                  status: detail.output!.success ? "success" : "failed",
                  progress: 100,
                  finishedAt: Date.now(),
                  output: detail.output!.output,
                  error: detail.output!.error,
                }
              : a,
          ),
        );
      }
    };

    window.addEventListener("agent-native:sub-agent-progress", handleProgress);
    return () => window.removeEventListener("agent-native:sub-agent-progress", handleProgress);
  }, []);

  /** Reset the progress state */
  const reset = () => {
    setSubAgents([]);
    setIsVisible(false);
  };

  /** Manually push a status update */
  const update = (id: string, update: Partial<SubAgentState>) => {
    setSubAgents((prev) => {
      const existing = prev.find((a) => a.agentId === id);
      if (existing) {
        return prev.map((a) => (a.agentId === id ? { ...a, ...update } : a));
      }
      return [
        ...prev,
        {
          agentId: id,
          agentName: AGENT_NAMES[id] ?? id,
          status: "pending",
          ...update,
        },
      ];
    });
  };

  return {
    subAgents,
    isVisible,
    reset,
    update,
    isRunning: subAgents.some((a) => a.status === "running"),
    isComplete: subAgents.every((a) => a.status === "success" || a.status === "failed"),
  };
}
