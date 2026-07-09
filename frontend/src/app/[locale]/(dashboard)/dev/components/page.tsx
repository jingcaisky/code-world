"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { Sparkles, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/states";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ConfirmDialog,
  FormField,
  IconButton,
  Input,
  SectionHeading,
} from "@/components/ui";

/**
 * Dev-only component gallery — a lightweight stand-in for Storybook that keeps
 * the design system honest. Renders the core primitives in one place so visual
 * regressions are easy to spot. Hidden in production builds.
 */
export default function ComponentGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card rounded-xl border p-5">
      <SectionHeading eyebrow="Primitive" title={title} className="mb-4" />
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

function Gallery() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader eyebrow="Dev" title="组件库" description="核心设计系统原语，一站式体验。" />

      <Section title="按钮变体">
        {(["default", "secondary", "outline", "ghost", "destructive", "link"] as const).map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
      </Section>

      <Section title="按钮大小">
        <Button size="sm">sm</Button>
        <Button size="default">default</Button>
        <Button size="lg">lg</Button>
        <IconButton aria-label="火花 (Sparkles)" size="icon-sm">
          <Sparkles />
        </IconButton>
        <IconButton aria-label="删除" size="icon">
          <Trash2 />
        </IconButton>
      </Section>

      <Section title="徽章">
        {(["default", "secondary", "outline", "destructive"] as const).map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </Section>

      <Section title="警报">
        <div className="w-full space-y-2">
          {(["default", "warning", "destructive", "success"] as const).map((v) => (
            <Alert key={v} variant={v}>
              <AlertTitle>{v} alert</AlertTitle>
              <AlertDescription>Something worth the user&apos;s attention.</AlertDescription>
            </Alert>
          ))}
        </div>
      </Section>

      <Section title="表单字段">
        <div className="w-full max-w-sm space-y-4">
          <FormField label="显示名称" htmlFor="g-name" description="团队成员可见。">
            <Input id="g-name" placeholder="Ada Lovelace" />
          </FormField>
          <FormField label="电子邮箱" htmlFor="g-email" error="That email is already taken." required>
            <Input id="g-email" type="email" defaultValue="taken@example.com" />
          </FormField>
        </div>
      </Section>

      <Section title="统计卡片">
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <StatCard label="额度" value="1,240" delta={12.5} deltaLabel="vs prior 7d" />
          <StatCard label="对话" value="38" footer="across all chats" />
          <StatCard label="知识库" value="0" unit="vectors" />
        </div>
      </Section>

      <Section title="空状态">
        <div className="w-full">
          <EmptyState
            icon={Sparkles}
            title="这里还没有任何内容"
            description="创建你的第一个项目以开始。"
            cta={{ label: "Create", onClick: () => {} }}
          />
        </div>
      </Section>

      <Section title="确认对话框">
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          删除一些内容…
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="删除此资源？"
          description="此操作无法撤销。"
          destructive
          confirmText="DELETE"
          confirmLabel="删除"
          onConfirm={() => setConfirmOpen(false)}
        />
      </Section>
    </div>
  );
}
