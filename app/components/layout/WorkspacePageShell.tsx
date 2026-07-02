import type { ComponentType, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WorkspaceChip {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  note?: string;
}

interface WorkspacePageShellProps {
  badge?: string;
  title: string;
  description: string;
  chips?: WorkspaceChip[];
  actions?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function WorkspacePageShell({
  badge,
  title,
  description,
  chips = [],
  actions,
  sidebar,
  children,
  className,
  contentClassName,
}: WorkspacePageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6",
        className,
      )}
    >
      <Card className="overflow-hidden rounded-[28px] border-border/70 bg-card/80 shadow-[0_20px_60px_-36px_rgba(15,23,42,0.4)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {badge ? (
              <Badge
                variant="secondary"
                className="border-border/60 bg-emerald-500/10 px-2.5 text-[10px] font-medium tracking-[0.2em] text-emerald-700 dark:text-emerald-300"
              >
                {badge}
              </Badge>
            ) : null}
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
            {chips.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <div
                      key={chip.label}
                      className="inline-flex items-start gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-sm text-foreground/80"
                    >
                      {Icon ? (
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      ) : null}
                      <span className="font-medium">{chip.label}</span>
                      {chip.note ? (
                        <span className="text-muted-foreground">
                          · {chip.note}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {sidebar ? (
          <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className={cn("min-w-0", contentClassName)}>{children}</div>
            <aside className="hidden xl:block">{sidebar}</aside>
          </div>
        ) : (
          <div className={cn("p-5", contentClassName)}>{children}</div>
        )}
      </Card>
    </div>
  );
}
