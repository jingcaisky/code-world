"use client";

import { SectionCard } from "@/components/settings/settings-section";
import { ThemeToggle } from "@/components/theme";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="主题" description="Light, dark, or follow your system preference.">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-medium">配色方案</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              影响整个控制面板。营销页面仍会交替显示不同版块。
            </p>
          </div>
          <div className="shrink-0">
            <ThemeToggle variant="dropdown" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
