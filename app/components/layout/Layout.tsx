import {
  AgentSidebar,
  AgentToggleButton,
  focusAgentChat,
  navigateWithAgentChatViewTransition,
  useAgentChatHomeHandoff,
  useAgentChatHomeHandoffLinks,
  useT,
} from "@agent-native/core/client";
import {
  IconCommand,
  IconGitBranch,
  IconMessageCircle,
  IconMenu2,
  IconSearch,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { APP_TITLE } from "@/lib/app-config";
import { TAB_ID } from "@/lib/tab-id";

import { Header } from "./Header";
import { HeaderActionsProvider } from "./HeaderActions";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_COLLAPSE_KEY = "chat.sidebar.collapsed";

function ShellBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--shell-accent)/0.18),transparent_72%)] blur-3xl" />
      <div className="absolute right-[-4rem] top-[-3rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--shell-accent-2)/0.16),transparent_72%)] blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--background))_100%)] opacity-80" />
    </div>
  );
}

function WorkspaceRightRail() {
  const t = useT();

  return (
    <aside className="hidden w-[316px] shrink-0 flex-col gap-3 border-s border-border/70 bg-background/50 p-3 xl:flex">
      <div className="rounded-[24px] border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/80">
            <IconSparkles className="size-4 text-foreground/75" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">AI 副驾驶</p>
              <Badge
                variant="secondary"
                className="h-5 border-border/60 bg-emerald-500/10 px-2 text-[10px] font-medium tracking-[0.18em] text-emerald-700 dark:text-emerald-300"
              >
                LIVE
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Chat 负责对话，Brain 负责知识，Plan 负责拆解。右侧区只保留最
              高频的协作入口和工作状态。
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {[
            {
              icon: IconMessageCircle,
              title: "Chat",
              desc: "解释代码、生成补丁、继续上下文。",
            },
            {
              icon: IconSearch,
              title: "Brain",
              desc: "检索项目记忆、决策和相关文档。",
            },
            {
              icon: IconTerminal2,
              title: "Plan",
              desc: "把任务拆成步骤，再回看执行进度。",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/75 px-3 py-3"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 rounded-[24px] border border-border/70 bg-card/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <IconCommand className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">快捷键</p>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/75 px-3 py-2">
            <span>{t("root.commandActions")}</span>
            <span className="font-mono text-[11px]">Ctrl/Cmd + K</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/75 px-3 py-2">
            <span>切换 AI 面板</span>
            <span className="font-mono text-[11px]">Ctrl/Cmd + \\</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/75 px-3 py-2">
            <span>聚焦 Chat</span>
            <span className="font-mono text-[11px]">Ctrl/Cmd + I</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function WorkspaceStatusBar({
  isChatRoute,
  showAgentToggle,
}: {
  isChatRoute: boolean;
  showAgentToggle: boolean;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-background/85 px-4 text-[11px] text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex min-w-0 items-center gap-2">
        <Badge
          variant="outline"
          className="h-6 border-border/70 bg-background/80 px-2 text-[10px] font-medium tracking-[0.16em] text-foreground/75"
        >
          {isChatRoute ? "CHAT" : "WORKSPACE"}
        </Badge>
        <span className="inline-flex items-center gap-1.5 truncate">
          <IconGitBranch className="size-3.5" />
          <span>main 分支</span>
        </span>
        <span>·</span>
        <span>自动同步</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline">Ctrl/Cmd + K</span>
        <span className="hidden md:inline">打开命令面板</span>
        {showAgentToggle && !isChatRoute ? <AgentToggleButton /> : null}
      </div>
    </div>
  );
}

/**
 * Routes whose page renders its own toolbar. Layout still wraps these with the
 * left Sidebar and agent surfaces but skips the global Header so they don't
 * double-stack chrome.
 */
function routeOwnsToolbar(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/chat/") ||
    pathname === "/database" ||
    pathname.startsWith("/extensions")
  );
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isChatRoute =
    location.pathname === "/" || location.pathname.startsWith("/chat/");
  const chatHomeHandoffActive = useAgentChatHomeHandoff({
    storageKey: "chat",
    activePath: location.pathname,
    enabled: !isChatRoute,
  });
  useAgentChatHomeHandoffLinks({
    storageKey: "chat",
    isChatPath: (pathname) => pathname === "/" || pathname.startsWith("/chat/"),
  });

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const closeMobileSidebar = () => setMobileSidebarOpen(false);
    window.addEventListener("agent-chat:open-thread", closeMobileSidebar);
    return () => {
      window.removeEventListener("agent-chat:open-thread", closeMobileSidebar);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      if (stored !== null) setSidebarCollapsed(stored === "1");
    } catch {
      // Ignore storage access errors; the default collapsed state still works.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSE_KEY,
        sidebarCollapsed ? "1" : "0",
      );
    } catch {
      // Ignore storage access errors.
    }
  }, [sidebarCollapsed]);

  const ownsToolbar = routeOwnsToolbar(location.pathname);
  function openAskAgentFullscreen() {
    focusAgentChat();
    navigateWithAgentChatViewTransition(navigate, "/");
  }

  const contentFrame = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {isChatRoute ? (
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t("navigation.openNavigation")}
          >
            <IconMenu2 className="size-4" />
          </Button>
          <span className="truncate text-sm font-semibold">{APP_TITLE}</span>
        </div>
      ) : ownsToolbar ? (
        <div className="flex h-12 shrink-0 items-center border-b border-border/70 bg-background/85 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t("navigation.openNavigation")}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconMenu2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Header onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
      )}
      <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain bg-background/70">
        {children}
      </main>
    </div>
  );

  const workspaceSurface = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/85 shadow-[0_32px_100px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {contentFrame}
      </div>
      {!isChatRoute && (
        <WorkspaceStatusBar
          isChatRoute={isChatRoute}
          showAgentToggle={ownsToolbar}
        />
      )}
    </div>
  );

  return (
    <HeaderActionsProvider>
      <div className="agent-layout-shell relative isolate flex h-screen w-full overflow-hidden bg-background text-foreground">
        <ShellBackdrop />
        <div className="agent-layout-left-drawer hidden md:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        </div>
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[260px] p-0">
            <SheetTitle className="sr-only">
              {t("navigation.navigation")}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {t("navigation.navigationDescription")}
            </SheetDescription>
            <Sidebar collapsed={false} collapsible={false} />
          </SheetContent>
        </Sheet>
        {isChatRoute ? (
          <div className="agent-layout-main-surface flex min-w-0 flex-1 overflow-hidden p-2 md:p-3">
            {workspaceSurface}
          </div>
        ) : (
          <AgentSidebar
            position="right"
            chatViewTransition
            storageKey="chat"
            browserTabId={TAB_ID}
            openOnChatRunning={chatHomeHandoffActive}
            onFullscreenRequest={openAskAgentFullscreen}
            emptyStateText={t("chat.inspectEmptyState")}
            suggestions={[
              t("chat.inspectSuggestionCapabilities"),
              t("chat.inspectSuggestionHello"),
              t("chat.inspectSuggestionAction"),
            ]}
          >
            {workspaceSurface}
          </AgentSidebar>
        )}
      </div>
    </HeaderActionsProvider>
  );
}
