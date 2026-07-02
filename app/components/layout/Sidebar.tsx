import {
  appPath,
  FeedbackButton,
  navigateWithAgentChatViewTransition,
  useChatThreads,
  useT,
  type ChatThreadSummary,
} from "@agent-native/core/client";
import { ExtensionsSidebarSection } from "@agent-native/core/client/extensions";
import { OrgSwitcher } from "@agent-native/core/client/org";
import {
  IconActivity,
  IconArchive,
  IconClock,
  IconDots,
  IconEdit,
  IconFolder,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMessageCircle,
  IconPin,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconSettings,
  IconPuzzle,
  IconFileText,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

const CHAT_STORAGE_KEY = "chat";
const CHAT_ACTIVE_THREAD_KEY = `agent-chat-active-thread:${CHAT_STORAGE_KEY}`;

function formatThreadAge(updatedAt: number) {
  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 时`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} 周`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 月`;
  return `${Math.floor(months / 12)} 年`;
}

function threadTitle(thread: ChatThreadSummary) {
  return thread.title || thread.preview || "未命名聊天";
}

function threadUpdatedAt(thread: ChatThreadSummary) {
  return Number.isFinite(thread.updatedAt)
    ? thread.updatedAt
    : Number.isFinite(thread.createdAt)
      ? thread.createdAt
      : 0;
}

function compareThreads(a: ChatThreadSummary, b: ChatThreadSummary) {
  const aPinned = a.pinnedAt ?? 0;
  const bPinned = b.pinnedAt ?? 0;
  if (aPinned || bPinned) return bPinned - aPinned;
  return threadUpdatedAt(b) - threadUpdatedAt(a);
}

function persistedActiveThreadId() {
  try {
    return localStorage.getItem(CHAT_ACTIVE_THREAD_KEY);
  } catch {
    return null;
  }
}

function threadIdFromPath(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function chatThreadPath(threadId: string) {
  return `/chat/${encodeURIComponent(threadId)}`;
}

interface SidebarProps {
  collapsed?: boolean;
  collapsible?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({
  collapsed = false,
  collapsible = true,
  onCollapsedChange,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();

  const isChatRoute =
    location.pathname === "/" || location.pathname.startsWith("/chat/");
  const ToggleIcon = collapsed
    ? IconLayoutSidebarLeftExpand
    : IconLayoutSidebarLeftCollapse;

  const {
    threads,
    activeThreadId: activeThreadIdFromHook,
    createThread,
    switchThread,
    pinThread,
    archiveThread,
    renameThread,
    refreshThreads,
  } = useChatThreads(undefined, CHAT_STORAGE_KEY, undefined, {
    autoCreate: false,
    restoreActiveThread: false,
  });

  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const committingRenameRef = useRef(false);

  // Dynamic Workspace Root Name
  const [workspaceName, setWorkspaceName] = useState("Code World1");

  useEffect(() => {
    async function fetchWorkspace() {
      try {
        // @ts-ignore
        if (window.electronAPI?.workspaceTree?.loadRoot) {
          // @ts-ignore
          const root = await window.electronAPI.workspaceTree.loadRoot({ depth: 1 });
          if (root && root.name) {
            setWorkspaceName(root.name);
          }
        }
      } catch (e) {
        console.error("Failed to load workspace root name", e);
      }
    }
    fetchWorkspace();
  }, []);

  const sortedThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.messageCount > 0 && !thread.archivedAt)
        .sort(compareThreads),
    [threads],
  );

  const currentActiveId = useMemo(
    () => threadIdFromPath(location.pathname) ?? (location.pathname === "/" ? null : activeThreadIdFromHook),
    [location.pathname, activeThreadIdFromHook]
  );

  // Split threads into active project thread and other historical threads
  const { projectThread, otherThreads } = useMemo(() => {
    const active = sortedThreads.find((t) => t.id === currentActiveId);
    const others = sortedThreads.filter((t) => t.id !== currentActiveId);
    return { projectThread: active, otherThreads: others };
  }, [sortedThreads, currentActiveId]);

  useEffect(() => {
    const refresh = () => refreshThreads();
    const handleRunning = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { isRunning?: unknown }
        | undefined;
      if (typeof detail?.isRunning === "boolean") refreshThreads();
    };

    window.addEventListener("agent-chat:threads-updated", refresh);
    window.addEventListener("agentNative.chatRunning", handleRunning);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("agent-chat:threads-updated", refresh);
      window.removeEventListener("agentNative.chatRunning", handleRunning);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshThreads]);

  useEffect(() => {
    if (!renamingThreadId) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renamingThreadId]);

  function openThread(threadId: string, options?: { isNew?: boolean }) {
    switchThread(threadId);
    navigateWithAgentChatViewTransition(
      navigate,
      options?.isNew ? "/" : chatThreadPath(threadId),
    );
    window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("agent-chat:open-thread", {
          detail: { threadId, newThread: options?.isNew === true },
        }),
      );
    });
  }

  async function handleNewChat() {
    const threadId = await createThread();
    if (threadId) openThread(threadId, { isNew: true });
  }

  async function handleArchiveThread(threadId: string) {
    const wasActive =
      threadId === currentActiveId || threadId === persistedActiveThreadId();
    const archived = await archiveThread(threadId);
    if (!archived) {
      toast.error(t("chat.archiveFailed"));
      return;
    }
    if (wasActive) {
      await handleNewChat();
    }
  }

  function startRenameThread(thread: ChatThreadSummary) {
    committingRenameRef.current = false;
    setRenameDraft(threadTitle(thread));
    setRenamingThreadId(thread.id);
  }

  function cancelRenameThread() {
    committingRenameRef.current = true;
    setRenamingThreadId(null);
    setRenameDraft("");
  }

  async function commitRenameThread() {
    if (committingRenameRef.current) return;
    const threadId = renamingThreadId;
    const title = renameDraft.trim();
    if (!threadId) return;
    committingRenameRef.current = true;
    setRenamingThreadId(null);
    setRenameDraft("");
    if (title) {
      const renamed = await renameThread(threadId, title);
      if (!renamed) toast.error(t("chat.renameFailed"));
    }
    committingRenameRef.current = false;
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void commitRenameThread();
  }

  // Trigger search command menu
  function handleSearchClick() {
    window.dispatchEvent(new CustomEvent("agent-native:open-command-menu"));
  }

  // Render a single thread row
  const renderThreadRow = (thread: ChatThreadSummary, showAge = true) => {
    const isActive = thread.id === currentActiveId;
    const isRenaming = thread.id === renamingThreadId;

    return (
      <div
        key={thread.id}
        className={cn(
          "group flex h-8 min-w-0 items-center rounded-lg text-xs transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        )}
      >
        {isRenaming ? (
          <form
            onSubmit={handleRenameSubmit}
            className="flex h-full min-w-0 flex-1 items-center px-2"
          >
            <Input
              ref={renameInputRef}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => void commitRenameThread()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRenameThread();
                }
              }}
              maxLength={160}
              aria-label={t("chat.renameThread", {
                title: threadTitle(thread),
              })}
              className="h-6 min-w-0 rounded border-sidebar-border bg-background px-1.5 text-[11px]"
            />
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openThread(thread.id)}
              className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-start outline-none"
            >
              <IconFileText className="size-3.5 shrink-0 text-muted-foreground/80" />
              <span className="min-w-0 flex-1 truncate">
                {threadTitle(thread)}
              </span>
            </button>
            <div className="relative flex size-7 shrink-0 items-center justify-end pe-2">
              {showAge && (
                <span className="text-[10px] text-sidebar-foreground/45 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
                  {formatThreadAge(threadUpdatedAt(thread))}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("chat.optionsFor", {
                      title: threadTitle(thread),
                    })}
                    className="absolute end-1 flex size-5 items-center justify-center rounded text-sidebar-foreground/60 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                  >
                    <IconDots className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right" sideOffset={6}>
                  <DropdownMenuItem onSelect={() => startRenameThread(thread)}>
                    <IconEdit className="size-3.5" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => pinThread(thread.id, !thread.pinnedAt)}
                  >
                    <IconPin className="size-3.5" />
                    {thread.pinnedAt ? "取消固定" : "固定"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                    onSelect={() => void handleArchiveThread(thread.id)}
                  >
                    <IconArchive className="size-3.5" />
                    归档
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>
    );
  };

  const collapseButton = collapsible ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className={cn(
            "flex shrink-0 items-center justify-center rounded text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            collapsed ? "size-7" : "size-6",
          )}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ToggleIcon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed ? "展开侧边栏" : "收起侧边栏"}
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] transition-[width] duration-200 ease-out",
        collapsed ? "w-12" : "w-56",
      )}
    >
      {/* 1. Header & New Chat Button */}
      {!collapsed ? (
        <div className="flex flex-col shrink-0 px-3 pt-4 pb-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border/80 bg-background/40 py-2 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150 shadow-sm"
          >
            <IconPlus className="size-3.5 text-sidebar-foreground/80" />
            <span>新对话</span>
          </button>
        </div>
      ) : (
        <div className="flex justify-center shrink-0 pt-4 pb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleNewChat}
                className="flex size-8 items-center justify-center rounded-lg border border-sidebar-border/80 bg-background/40 text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-150"
              >
                <IconPlus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">新对话</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* 2. Main Navigation List */}
      <div className={cn("flex flex-col shrink-0 gap-0.5", collapsed ? "px-1" : "px-2.5")}>
        {/* Search */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSearchClick}
                className="flex h-9 w-full justify-center items-center rounded-lg text-sidebar-foreground/75 hover:bg-sidebar-accent"
              >
                <IconSearch className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">搜索</TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={handleSearchClick}
            className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-xs text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-left"
          >
            <IconSearch className="size-4 text-muted-foreground/80" />
            <span>搜索</span>
          </button>
        )}

        {/* Scheduled (Observability) */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/observability"
                className="flex h-9 w-full justify-center items-center rounded-lg text-sidebar-foreground/75 hover:bg-sidebar-accent"
              >
                <IconActivity className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">已安排</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            to="/observability"
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2 text-xs transition-colors",
              location.pathname.startsWith("/observability")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <IconClock className="size-4 text-muted-foreground/80" />
            <span>已安排</span>
          </Link>
        )}

        {/* Plugins (Extensions) */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/extensions"
                className="flex h-9 w-full justify-center items-center rounded-lg text-sidebar-foreground/75 hover:bg-sidebar-accent"
              >
                <IconPuzzle className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">插件</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            to="/extensions"
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2 text-xs transition-colors",
              location.pathname.startsWith("/extensions")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <IconPuzzle className="size-4 text-muted-foreground/80" />
            <span>插件</span>
          </Link>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 my-2 border-t border-sidebar-border/50 shrink-0" />

      {/* 3. Thread Sections (Project & Conversations) */}
      {!collapsed ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 space-y-4 pb-4">
          {/* A. 项目 (Projects) Section */}
          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              项目
            </h3>
            <div className="space-y-0.5">
              {/* Active Workspace Directory */}
              <div className="flex h-8 items-center gap-2 px-2 text-xs text-sidebar-foreground font-medium">
                <IconFolder className="size-4 text-blue-500/80 fill-blue-500/10" />
                <span className="truncate">{workspaceName}</span>
              </div>
              {/* Nested Active Thread */}
              {projectThread && (
                <div className="ps-4 border-l border-sidebar-border/60 ms-3.5 space-y-0.5 mt-0.5">
                  {renderThreadRow(projectThread, false)}
                </div>
              )}
            </div>
          </div>

          {/* B. 对话 (Conversations) Section */}
          <div className="space-y-1">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              对话
            </h3>
            <div className="space-y-0.5">
              {otherThreads.length > 0 ? (
                otherThreads.map((thread) => renderThreadRow(thread, true))
              ) : (
                <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/40 italic">
                  无历史对话
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-3 py-2">
          {/* Collapsed view placeholders */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex size-7 items-center justify-center rounded text-sidebar-foreground/40">
                <IconFolder className="size-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">项目: {workspaceName}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* 4. Bottom Area (Settings & Extensions) */}
      <div className={cn("mt-auto shrink-0 border-t border-sidebar-border/50", collapsed ? "py-1" : "py-2")}>
        {!collapsed && (
          <div className="px-2 pb-1">
            <ExtensionsSidebarSection />
          </div>
        )}

        {/* Settings Row */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/settings"
                className="flex h-9 w-full justify-center items-center rounded-lg text-sidebar-foreground/75 hover:bg-sidebar-accent"
              >
                <IconSettings className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">设置</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            to="/settings"
            className={cn(
              "flex h-8 items-center justify-between rounded-lg px-2.5 mx-2 text-xs transition-colors",
              location.pathname.startsWith("/settings")
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <IconSettings className="size-4 text-muted-foreground/80" />
              <span className="truncate">设置</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge className="h-4 bg-blue-500/10 border-none text-[9px] text-blue-500 dark:text-blue-400 font-bold px-1.5">
                Plus
              </Badge>
              <Badge className="h-4 bg-emerald-500/10 border-none text-[9px] text-emerald-500 dark:text-emerald-400 font-bold px-1.5">
                更新
              </Badge>
            </div>
          </Link>
        )}

        <div className={cn(collapsed ? "px-1 py-1" : "px-3 py-2")}>
          <OrgSwitcher
            reserveSpace
            className={
              collapsed
                ? "h-8 justify-center px-0 [&>span]:sr-only [&>svg:last-child]:hidden"
                : undefined
            }
          />
        </div>

        <div
          className={cn(
            collapsed ? "flex justify-center px-1 py-1" : "px-3 py-2",
          )}
        >
          <FeedbackButton
            variant={collapsed ? "icon" : "sidebar"}
            side="right"
            align={collapsed ? "center" : "end"}
          />
        </div>

        {collapseButton && (
          <div
            className={cn(
              collapsed
                ? "flex justify-center px-1 py-1"
                : "flex justify-end px-3 py-1",
            )}
          >
            {collapseButton}
          </div>
        )}
      </div>
    </aside>
  );
}
