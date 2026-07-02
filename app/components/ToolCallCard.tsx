/**
 * ToolCallCard — Tool Call Status Display
 *
 * Shows real-time tool invocation progress as dynamic status cards.
 * Each card displays: tool name, status icon, elapsed time,
 * optional progress bar, input summary, and result preview.
 *
 * System-level capability — UI component, consumed by the chat page.
 *
 * Part of: Code World Architecture — System Services (Frontend)
 */

import {
  IconCheck,
  IconChevronDown,
  IconFileCode,
  IconFileSearch,
  IconGlobe,
  IconLoader2,
  IconSearch,
  IconTerminal2,
  IconX,
  IconGitBranch,
  IconTestPipe,
  IconPencil,
  IconTrash,
  IconScan,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

export type ToolCallStatus = "pending" | "running" | "success" | "failed";

export interface ToolCall {
  id: string;
  tool: string;
  label: string;
  status: ToolCallStatus;
  progress?: number;
  startedAt: number;
  finishedAt?: number;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface ToolCallEvent {
  type: "tool_start" | "tool_done";
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

// ── Tool Icon Mapping ─────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Search
  "zvec-search": IconSearch,
  "web-search": IconGlobe,
  "grep-search": IconFileSearch,
  "mcp-file-read": IconFileSearch,
  // Code editing
  "file-create": IconFileCode,
  "file-update": IconPencil,
  "file-delete": IconTrash,
  "file-batch-update": IconPencil,
  // Execution
  "run-command": IconTerminal2,
  "run-test": IconTestPipe,
  // Quality
  "type-check": IconCheck,
  "lint-fix": IconScan,
  "format-code": IconPencil,
  "code-review": IconScan,
  // Git
  "git-ops": IconGitBranch,
};

const TOOL_COLORS: Record<string, string> = {
  "zvec-search": "border-blue-500/20 bg-blue-500/[0.03] text-blue-500",
  "web-search": "border-emerald-500/20 bg-emerald-500/[0.03] text-emerald-500",
  "grep-search": "border-sky-500/20 bg-sky-500/[0.03] text-sky-500",
  "mcp-file-read": "border-sky-500/20 bg-sky-500/[0.03] text-sky-500",
  "file-create": "border-amber-500/20 bg-amber-500/[0.03] text-amber-500",
  "file-update": "border-amber-500/20 bg-amber-500/[0.03] text-amber-500",
  "file-delete": "border-red-500/20 bg-red-500/[0.03] text-red-500",
  "file-batch-update": "border-amber-500/20 bg-amber-500/[0.03] text-amber-500",
  "run-command": "border-violet-500/20 bg-violet-500/[0.03] text-violet-500",
  "run-test": "border-violet-500/20 bg-violet-500/[0.03] text-violet-500",
  "type-check": "border-cyan-500/20 bg-cyan-500/[0.03] text-cyan-500",
  "lint-fix": "border-cyan-500/20 bg-cyan-500/[0.03] text-cyan-500",
  "format-code": "border-cyan-500/20 bg-cyan-500/[0.03] text-cyan-500",
  "code-review": "border-pink-500/20 bg-pink-500/[0.03] text-pink-500",
  "git-ops": "border-orange-500/20 bg-orange-500/[0.03] text-orange-500",
};

/** Human-readable labels for tools */
const TOOL_LABELS: Record<string, string> = {
  "zvec-search": "语义搜索代码",
  "web-search": "搜索网络文档",
  "grep-search": "代码内容搜索",
  "mcp-file-read": "读取文件",
  "file-create": "创建文件",
  "file-update": "修改文件",
  "file-delete": "删除文件",
  "file-batch-update": "批量修改文件",
  "run-command": "执行命令",
  "run-test": "运行测试",
  "type-check": "类型检查",
  "lint-fix": "代码检查",
  "format-code": "格式化代码",
  "code-review": "代码审查",
  "git-ops": "Git 操作",
};

// ── Component ─────────────────────────────────────────────────────────

interface ToolCallCardProps {
  calls: ToolCall[];
  className?: string;
}

export function ToolCallCards({ calls, className }: ToolCallCardProps) {
  if (calls.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {calls.map((call) => (
        <ToolCard key={call.id} call={call} />
      ))}
    </div>
  );
}

// ── Single Tool Card ──────────────────────────────────────────────────

function ToolCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const elapsed = call.finishedAt
    ? ((call.finishedAt - call.startedAt) / 1000).toFixed(1)
    : ((Date.now() - call.startedAt) / 1000).toFixed(1);

  const colorClass = TOOL_COLORS[call.tool] || "border-border/70 bg-muted/30";
  const IconComponent = TOOL_ICONS[call.tool] || IconTerminal2;
  const label = TOOL_LABELS[call.tool] || call.label || call.tool;

  // Status icon
  const StatusIcon = {
    pending: () => <span className="size-1.5 rounded-full bg-muted-foreground/40" />,
    running: () => <IconLoader2 className="size-3 animate-spin" />,
    success: () => <IconCheck className="size-3 text-emerald-500" />,
    failed: () => <IconX className="size-3 text-red-500" />,
  }[call.status];

  // Input summary
  const inputSummary = call.input
    ? Object.entries(call.input)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
        .join(", ")
    : null;

  return (
    <div className={cn("rounded-lg border transition-colors", colorClass)}>
      {/* Main row */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:opacity-80"
      >
        <div className="flex size-5 shrink-0 items-center justify-center rounded bg-current/10">
          <IconComponent className="size-3" />
        </div>

        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>

        {inputSummary && call.status === "running" && (
          <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
            {inputSummary}
          </span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {call.status === "running" && call.progress !== undefined && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {call.progress}%
            </span>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {elapsed}s
          </span>
          <StatusIcon />
          <IconChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-current/10 px-3 py-2 text-xs">
          {/* Input */}
          {call.input && Object.keys(call.input).length > 0 && (
            <div className="mb-1.5">
              <span className="font-medium text-muted-foreground">输入:</span>
              <pre className="mt-0.5 max-h-24 overflow-auto rounded bg-black/5 p-1.5 text-[11px] dark:bg-white/5">
                {JSON.stringify(call.input, null, 1).slice(0, 500)}
              </pre>
            </div>
          )}

          {/* Output */}
          {call.output && (
            <div>
              <span className="font-medium text-muted-foreground">输出:</span>
              <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-black/5 p-1.5 text-[11px] whitespace-pre-wrap break-words dark:bg-white/5">
                {call.output.slice(0, 800)}
              </pre>
            </div>
          )}

          {/* Error */}
          {call.error && (
            <div className="text-red-500">
              <span className="font-medium">错误:</span> {call.error}
            </div>
          )}
        </div>
      )}

      {/* Progress bar for running calls */}
      {call.status === "running" && call.progress !== undefined && (
        <div className="h-0.5 w-full bg-current/10">
          <div
            className="h-full bg-current/30 transition-all duration-300"
            style={{ width: `${call.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Mini Tool Status Bar ──────────────────────────────────────────────

/**
 * Compact inline tool status — used when space is limited.
 */
export function ToolCallMini({ calls }: { calls: ToolCall[] }) {
  const running = calls.filter((c) => c.status === "running").length;
  const completed = calls.filter((c) => c.status === "success").length;
  const failed = calls.filter((c) => c.status === "failed").length;

  if (calls.length === 0) return null;

  const parts: string[] = [];
  if (running > 0) parts.push(`${running} 执行中`);
  if (completed > 0) parts.push(`${completed} 完成`);
  if (failed > 0) parts.push(`${failed} 失败`);

  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <IconTerminal2 className="size-3" />
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Hook to manage tool call state from SSE events.
 */
export function useToolCalls() {
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const activeCallsRef = useRef<Map<string, string>>(new Map());

  const onToolStart = (tool: string, input?: Record<string, unknown>) => {
    const id = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setCalls((prev) => [
      ...prev,
      {
        id,
        tool,
        label: TOOL_LABELS[tool] || tool,
        status: "running",
        startedAt: Date.now(),
        input,
      },
    ]);
    activeCallsRef.current.set(tool, id);
    return id;
  };

  const onToolDone = (tool: string, result?: string, isError?: boolean) => {
    setCalls((prev) =>
      prev.map((c) =>
        c.tool === tool && c.status === "running"
          ? {
              ...c,
              status: isError ? "failed" : "success",
              finishedAt: Date.now(),
              output: result,
              error: isError ? result : undefined,
            }
          : c,
      ),
    );
  };

  const clear = () => {
    setCalls([]);
    activeCallsRef.current.clear();
  };

  return {
    calls,
    onToolStart,
    onToolDone,
    clear,
    runningCount: calls.filter((c) => c.status === "running").length,
    hasRunning: calls.some((c) => c.status === "running"),
  };
}
