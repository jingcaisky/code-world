import { AgentToggleButton, useT } from "@agent-native/core/client";
import {
  IconGitBranch,
  IconMenu2,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";
import { useLocation } from "react-router";

import { Badge } from "@/components/ui/badge";
import { APP_TITLE } from "@/lib/app-config";

import { useHeaderTitle, useHeaderActions } from "./HeaderActions";

const pageTitleKeys: Record<string, string> = {
  "/": "navigation.chat",
  "/observability": "navigation.observability",
  "/settings": "navigation.settings",
};

function resolveTitle(pathname: string, t: (key: string) => string): string {
  if (pageTitleKeys[pathname]) return t(pageTitleKeys[pathname]);
  if (pathname.startsWith("/extensions")) return t("navigation.extensions");
  return APP_TITLE;
}

interface HeaderProps {
  onOpenMobileSidebar?: () => void;
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const location = useLocation();
  const t = useT();
  const title = useHeaderTitle();
  const actions = useHeaderActions();

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 lg:px-6">
      {onOpenMobileSidebar && (
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label={t("navigation.openNavigation")}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl border border-border/70 bg-card/70 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          <IconMenu2 className="h-4 w-4" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-gradient-to-br from-primary/15 via-primary/10 to-transparent shadow-sm">
          <span className="text-[11px] font-semibold tracking-[0.28em] text-foreground/80">
            CW
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.34em] text-muted-foreground">
              Code World IDE
            </p>
            <Badge
              variant="secondary"
              className="border-border/60 bg-emerald-500/10 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
            >
              AI 副驾驶
            </Badge>
          </div>
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {title ?? resolveTitle(location.pathname, t)}
          </h1>
        </div>
      </div>
      <div className="hidden items-center gap-2 xl:flex">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <IconGitBranch className="size-3.5" />
          <span>main 分支</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <IconSparkles className="size-3.5" />
          <span>Chat / Brain / Plan</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <IconTerminal2 className="size-3.5" />
          <span>终端就绪</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <AgentToggleButton />
      </div>
    </header>
  );
}
