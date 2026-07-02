import { focusAgentChat, useT } from "@agent-native/core/client";
import { DbAdminPage } from "@agent-native/core/client/db-admin";
import {
  IconDatabase,
  IconSearch,
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
  return [{ title: `数据库 - ${APP_TITLE}` }];
}

export default function DatabasePage() {
  const t = useT();
  useSetPageTitle(t("pages.databaseTitle"));
  useSetHeaderActions(
    <Button variant="outline" size="sm" onClick={() => focusAgentChat()}>
      <IconSparkles className="size-4" />
      问 Chat
    </Button>,
  );
  return (
    <WorkspacePageShell
      badge="数据控制台"
      title="数据库"
      description="把表浏览、结构检查和管理操作放在同一块工作区里。数据库页应该像 IDE 里的一个工具面板，而不是单独跳出去的后台页面。"
      chips={[
        {
          label: "表浏览",
          icon: IconDatabase,
          note: "数据结构",
        },
        {
          label: "检索",
          icon: IconSearch,
          note: "快速定位",
        },
        {
          label: "协作",
          icon: IconTerminal2,
          note: "交给 Chat 生成操作",
        },
      ]}
      sidebar={
        <div className="grid gap-3">
          <Card className="border-border/70 bg-background/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">安全提示</CardTitle>
              <CardDescription>先读后写，先查后改。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>• 确认当前表和环境</p>
              <p>• 先在 Chat 里生成 SQL 或操作思路</p>
              <p>• 变更后检查结果和回滚路径</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">常用动作</CardTitle>
              <CardDescription>
                以浏览和审查为主，避免打断主工作流。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>• 搜索表与字段</p>
              <p>• 查看模式和索引</p>
              <p>• 与 Agent 协同执行修复</p>
            </CardContent>
          </Card>
        </div>
      }
      contentClassName="p-0"
    >
      <div className="min-h-[72vh] overflow-hidden rounded-[24px] border border-border/70 bg-background/80 shadow-sm">
        <DbAdminPage />
      </div>
    </WorkspacePageShell>
  );
}
