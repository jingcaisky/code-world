import {
  ObservabilityDashboard,
  focusAgentChat,
  useT,
} from "@agent-native/core/client";
import {
  IconActivity,
  IconGauge,
  IconSparkles,
  IconTerminal2,
} from "@tabler/icons-react";

import {
  useSetHeaderActions,
  useSetPageTitle,
} from "@/components/layout/HeaderActions";
import { WorkspacePageShell } from "@/components/layout/WorkspacePageShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `代理可观测性 - ${APP_TITLE}` }];
}

export default function ObservabilityPage() {
  const t = useT();
  useSetPageTitle(t("pages.observabilityPageTitle"));
  useSetHeaderActions(
    <Button variant="outline" size="sm" onClick={() => focusAgentChat()}>
      <IconSparkles className="size-4" />
      问 Chat
    </Button>,
  );

  return (
    <WorkspacePageShell
      badge="观测面板"
      title="代理可观测性"
      description="用更接近 IDE 的视角查看运行状态、错误聚合和实时指标。这里保留的是最重要的监控信息，而不是普通仪表盘堆叠。"
      chips={[
        {
          label: "实时指标",
          icon: IconGauge,
          note: "运行健康",
        },
        {
          label: "错误追踪",
          icon: IconActivity,
          note: "异常聚合",
        },
        {
          label: "协作入口",
          icon: IconTerminal2,
          note: "一键询问 Chat",
        },
      ]}
      sidebar={
        <div className="grid gap-3">
          <Card className="border-border/70 bg-background/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">看什么</CardTitle>
              <CardDescription>
                先看健康，再看趋势，最后看异常。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>• 请求延迟和错误率</p>
              <p>• Agent 运行状态和任务结果</p>
              <p>• 最近一次构建或同步变化</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">工作方式</CardTitle>
              <CardDescription>
                把图表当成上下文入口，而不是终点。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>• 先在右侧 Chat 里问原因</p>
              <p>• 再回到页面观察指标变化</p>
              <p>• 需要改动时直接让 AI 生成补丁</p>
            </CardContent>
          </Card>
        </div>
      }
      contentClassName="p-0"
    >
      <div className="min-h-[72vh] overflow-hidden rounded-[24px] border border-border/70 bg-background/80 shadow-sm">
        <ObservabilityDashboard />
      </div>
    </WorkspacePageShell>
  );
}
