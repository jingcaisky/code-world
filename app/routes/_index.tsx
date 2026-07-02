import {
  AgentChatSurface,
  markAgentChatHomeHandoff,
  useT,
} from "@agent-native/core/client";
import {
  IconFiles,
  IconSparkles,
  IconTerminal2,
  IconChevronDown,
  IconChevronUp,
  IconActivity,
} from "@tabler/icons-react";
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router";

import { AppLauncher } from "@/components/AppLauncher";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { APP_TITLE } from "@/lib/app-config";
import { TAB_ID } from "@/lib/tab-id";

// ── Code World: System UI Components ──────────────────────────────────
import { ReasoningTrace, ThinkingSkeleton, useReasoningTrace } from "@/components/ReasoningTrace";
import { ToolCallCards, ToolCallMini, useToolCalls } from "@/components/ToolCallCard";
import { SubAgentProgress, useSubAgentProgress } from "@/components/SubAgentProgress";

// ── SEO ───────────────────────────────────────────────────────────────

const SEO_TITLE = `${APP_TITLE} — AI 副驾驶编码工作台`;
const SEO_DESCRIPTION =
  "面向代码编辑场景的 AI 原生工作台，提供持久聊天、A2A 协作、共享状态、工具和可扩展后端。";

export function meta() {
  return [
    { title: SEO_TITLE },
    { name: "description", content: SEO_DESCRIPTION },
    { property: "og:title", content: SEO_TITLE },
    { property: "og:description", content: SEO_DESCRIPTION },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: SEO_TITLE },
    { name: "twitter:description", content: SEO_DESCRIPTION },
  ];
}

function chatThreadPath(threadId: string | null) {
  return threadId ? `/chat/${encodeURIComponent(threadId)}` : "/";
}

// ── Agent Activity Panel ──────────────────────────────────────────────
// Floating overlay that shows thinking, tool calls, and sub-agent progress

function AgentActivityPanel({
  reasoning,
  toolCalls,
  subAgent,
  isActive,
}: {
  reasoning: ReturnType<typeof useReasoningTrace>;
  toolCalls: ReturnType<typeof useToolCalls>;
  subAgent: ReturnType<typeof useSubAgentProgress>;
  isActive: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Auto-expand when activity starts
  useEffect(() => {
    if (isActive) setCollapsed(false);
  }, [isActive]);

  // Hide entirely when no activity
  if (!isActive && reasoning.blocks.length === 0 && toolCalls.calls.length === 0 && !subAgent.isVisible) {
    return null;
  }

  const hasContent =
    reasoning.hasActiveThinking ||
    reasoning.blocks.length > 0 ||
    toolCalls.calls.length > 0 ||
    subAgent.isVisible;

  if (!hasContent && !isActive) return null;

  return (
    <div className="absolute right-4 top-4 z-20 w-80">
      <div className="rounded-2xl border border-border/70 bg-card/90 shadow-lg backdrop-blur-xl">
        {/* Header */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        >
          <div className="flex size-6 items-center justify-center rounded-lg border border-border/70 bg-background/80">
            <IconActivity className={cn("size-3", isActive && "animate-pulse text-blue-500")} />
          </div>
          <span className="min-w-0 flex-1 text-xs font-medium">
            {isActive ? "Agent 工作中..." : "Activity"}
          </span>
          {toolCalls.hasRunning && (
            <ToolCallMini calls={toolCalls.calls} />
          )}
          {collapsed ? (
            <IconChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <IconChevronUp className="size-3 text-muted-foreground" />
          )}
        </button>

        {/* Content */}
        {!collapsed && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-border/50 px-3 py-2 space-y-2">
            {/* Thinking indicator */}
            {reasoning.hasActiveThinking && <ThinkingSkeleton />}

            {/* Reasoning trace */}
            <ReasoningTrace blocks={reasoning.blocks} />

            {/* Tool calls */}
            <ToolCallCards calls={toolCalls.calls} />

            {/* Sub-agent progress */}
            {subAgent.isVisible && (
              <SubAgentProgress subAgents={subAgent.subAgents} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Chat Route ───────────────────────────────────────────────────

export default function ChatRoute() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const t = useT();

  // Code World: System UI hooks
  const reasoning = useReasoningTrace();
  const toolCalls = useToolCalls();
  const subAgent = useSubAgentProgress();
  const [agentActive, setAgentActive] = useState(false);

  // Track agent running state
  useEffect(() => {
    function handleChatRunning(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (detail?.isRunning === true) {
        markAgentChatHomeHandoff("chat");
        setAgentActive(true);
      } else if (detail?.isRunning === false) {
        setAgentActive(false);
        reasoning.clear();
        toolCalls.clear();
      }
    }

    // Wire tool call events from agent chat SSE stream
    function handleAgentStreamEvent(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;

      // Tool calls (tool_start / tool_done events from SSE)
      if (detail.type === "tool_start") {
        toolCalls.onToolStart(detail.tool, detail.input);
      } else if (detail.type === "tool_done") {
        toolCalls.onToolDone(detail.tool, detail.result, detail.isError);
      }

      // Thinking stream (text-delta with thinking flag)
      if (detail.type === "thinking") {
        if (!reasoning.hasActiveThinking) {
          const id = reasoning.startThinking();
          reasoning.appendDelta(id, detail.text || "");
        }
      } else if (detail.type === "text") {
        if (reasoning.hasActiveThinking) {
          // End thinking block when actual text response starts
          for (const b of reasoning.blocks) {
            if (b.isStreaming) reasoning.endThinking(b.id);
          }
        }
      }

      // Sub-agent progress
      if (detail.layer === 3) {
        window.dispatchEvent(
          new CustomEvent("agent-native:sub-agent-progress", { detail }),
        );
      }
    }

    window.addEventListener("agentNative.chatRunning", handleChatRunning);
    window.addEventListener("agentNative.streamEvent", handleAgentStreamEvent);

    return () => {
      window.removeEventListener("agentNative.chatRunning", handleChatRunning);
      window.removeEventListener("agentNative.streamEvent", handleAgentStreamEvent);
    };
  }, [reasoning, toolCalls]);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Background ambient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-[-8rem] top-[-5rem] h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--shell-accent)/0.22),transparent_72%)] blur-3xl" />
        <div className="absolute right-[-6rem] top-16 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--shell-accent-2)/0.18),transparent_72%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] opacity-80" />
      </div>

      {/* Code World: Agent Activity Panel (floating overlay) */}
      <AgentActivityPanel
        reasoning={reasoning}
        toolCalls={toolCalls}
        subAgent={subAgent}
        isActive={agentActive}
      />

      {/* Main chat surface */}
      <AgentChatSurface
        mode="page"
        chatViewTransition
        className="h-full"
        defaultMode="chat"
        storageKey="chat"
        threadUrlSync={{
          routeThreadId: threadId ?? null,
          getPath: chatThreadPath,
          navigate,
        }}
        browserTabId={TAB_ID}
        showHeader={false}
        showTabBar={false}
        dynamicSuggestions={false}
        suggestions={[
          t("chat.suggestionCapabilities"),
          t("chat.suggestionCustomize"),
          t("chat.suggestionActions"),
        ]}
        emptyStateText={t("chat.emptyState")}
        emptyStateDisplay="hidden"
        centerComposerWhenEmpty
        composerLayoutVariant="hero"
        composerPlaceholder={t("chat.composerPlaceholder")}
        composerSlot={
          <div className="mx-auto mb-6 w-full max-w-5xl px-4">
            <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/80 shadow-[0_30px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
                <Badge
                  variant="secondary"
                  className="border-border/60 bg-emerald-500/10 text-[10px] font-medium tracking-[0.18em] text-emerald-700 dark:text-emerald-300"
                >
                  AI 副驾驶
                </Badge>
                <span>代码编辑为核心</span>
                <span>·</span>
                <span>Chat / Brain / Plan 协同</span>
                <span className="ml-auto rounded-full border border-border/70 bg-background/70 px-2.5 py-1 font-mono text-[11px] text-foreground/70">
                  ⌘K / Ctrl+K
                </span>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)] lg:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
                    <span>{APP_TITLE}</span>
                    <span>workspace</span>
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {t("chat.heroTitle")}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {t("chat.heroDescription")}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 text-sm">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                      <IconFiles className="size-4 text-muted-foreground" />
                      <span>Explorer</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                      <IconSparkles className="size-4 text-muted-foreground" />
                      <span>Copilot</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                      <IconTerminal2 className="size-4 text-muted-foreground" />
                      <span>Terminal</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {[
                    { title: "主编辑器", value: "Monaco", note: "标签页 + 分屏" },
                    { title: "AI 通道", value: "Chat / Brain", note: "解释、生成、检索" },
                    { title: "工作面板", value: "Terminal", note: "问题、调试、命令" },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-border/70 bg-background/70 p-4"
                    >
                      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        {item.title}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-foreground">
                        {item.value}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        }
      />
      <AppLauncher />
    </div>
  );
}
