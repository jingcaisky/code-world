import {
  ChangelogSettingsCard,
  focusAgentChat,
  LanguagePicker,
  SettingsTabsPage,
  openAgentSettings,
  useT,
} from "@agent-native/core/client";
import { TeamPage } from "@agent-native/core/client/org";
import {
  IconHistory,
  IconSettings,
  IconSparkles,
  IconUsers,
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
import { Label } from "@/components/ui/label";
import { APP_TITLE } from "@/lib/app-config";

import changelog from "../../CHANGELOG.md?raw";

export function meta() {
  return [{ title: `设置 - ${APP_TITLE}` }];
}

export default function SettingsRoute() {
  const t = useT();
  useSetPageTitle(t("settings.title"));
  useSetHeaderActions(
    <Button variant="outline" size="sm" onClick={() => focusAgentChat()}>
      <IconSparkles className="size-4" />
      问 Chat
    </Button>,
  );

  return (
    <WorkspacePageShell
      badge="设置工作区"
      title="设置"
      description="统一管理语言、Agent 配置、团队协作和更新内容。这里保留的是工作区级设置，而不是和代码编辑无关的杂项面板。"
      chips={[
        {
          label: "语言",
          icon: IconSettings,
          note: "界面与消息",
        },
        {
          label: "团队",
          icon: IconUsers,
          note: "共享工作区",
        },
        {
          label: "更新",
          icon: IconHistory,
          note: "最近变化",
        },
      ]}
      contentClassName="p-0"
    >
      <SettingsTabsPage
        teamLabel={t("navigation.team")}
        className="overflow-hidden rounded-[24px] border border-border/70 bg-background/80 shadow-sm backdrop-blur-xl"
        navClassName="bg-background/60 sm:w-56"
        contentClassName="bg-background/50"
        general={
          <div className="mx-auto w-full max-w-3xl space-y-6">
            <p className="text-sm leading-6 text-muted-foreground">
              {t("settings.description")}
            </p>

            <Card className="border-border/70 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("settings.languageTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.languageDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="max-w-xs space-y-1.5">
                <Label>{t("settings.languageLabel")}</Label>
                <LanguagePicker label={t("settings.languageLabel")} />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/80 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("settings.agentTitle")}
                </CardTitle>
                <CardDescription>
                  {t("settings.agentDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => openAgentSettings()}>
                  {t("settings.openAgentSettings")}
                </Button>
                <Button variant="ghost" onClick={() => focusAgentChat()}>
                  <IconSparkles className="size-4" />
                  问 Chat
                </Button>
              </CardContent>
            </Card>
          </div>
        }
        team={
          <div className="mx-auto w-full max-w-3xl">
            <TeamPage
              showTitle={false}
              createOrgDescription={t("pages.teamCreateOrgDescription")}
            />
          </div>
        }
        whatsNew={
          <div className="mx-auto w-full max-w-3xl">
            <ChangelogSettingsCard markdown={changelog} />
          </div>
        }
      />
    </WorkspacePageShell>
  );
}
