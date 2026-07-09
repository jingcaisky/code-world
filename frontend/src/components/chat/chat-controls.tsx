"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Cpu,
  Database,
  Lock,
  Settings2,
  Sliders,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { useKnowledgeBases, useConversations } from "@/hooks";
import { useConversationStore, useKBSelectionStore } from "@/stores";
import { cn } from "@/lib/utils";
import type { KBScope, KnowledgeBase } from "@/types";

type ThinkingEffort = "off" | "low" | "medium" | "high";
type Tab = "kb" | "model" | "settings";

interface ChatControlsProps {
  onModelChange?: (model: string | null) => void;
  onTemperatureChange?: (value: number | null) => void;
  onThinkingEffortChange?: (value: "low" | "medium" | "high" | null) => void;
}
const SCOPE_META: Record<KBScope, { label: string; icon: LucideIcon }> = {
  personal: { label: "个人", icon: Lock },
  org: { label: "组织", icon: Users },
  app: { label: "全局", icon: Sparkles },
};

const SECTION_ORDER: KBScope[] = ["personal", "org", "app"];

const EFFORT_OPTIONS: { label: string; value: ThinkingEffort; hint: string }[] = [
  { label: "关闭", value: "off", hint: "直接回答，不推理" },
  { label: "低", value: "low", hint: "快速推理" },
  { label: "中", value: "medium", hint: "平衡" },
  { label: "高", value: "high", hint: "深度推理，较慢" },
];

/**
 * Unified popover panel that replaces the 3 separate triggers (KB / Model /
 * Chat settings) with a single button that summarizes current state and opens
 * a tabbed control surface.
 */
export function ChatControls({
  onModelChange,
  onTemperatureChange,
  onThinkingEffortChange,
}: ChatControlsProps) {
  const [tab, setTab] = useState<Tab>("kb");
  const { kbs, isLoading: kbsLoading, fetchKBs } = useKnowledgeBases();
  // Selector-narrowed subscriptions: re-render only when these specific fields
  // change. The whole-store form re-rendered ChatControls on every conv-store
  // mutation (incl. ones unrelated to KB), which combined with the inline
  // `setModel` ref from use-chat caused an effect-driven loop during streaming.
  const currentConversationId = useConversationStore((s) => s.currentConversationId);
  // The conversations list now lives in React Query (via useConversations);
  // currentConversationId remains UI state in the store.
  const { conversations, updateActiveKBs } = useConversations();
  const activeKBIds = useKBSelectionStore((s) => s.activeKBIds);
  const toggleKB = useKBSelectionStore((s) => s.toggle);
  const hydrate = useKBSelectionStore((s) => s.hydrateFromConversation);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchKBs();
  }, [fetchKBs]);

  // Hydrate from a saved conversation once per conv switch. We guard with a
  // ref so even if upstream state re-emits the same conversation object with a
  // new identity (fetch refresh, etc.), we don't re-fire `set()` and trigger
  // another render cascade.
  const lastHydratedConvRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentConversationId) {
      lastHydratedConvRef.current = null;
      return;
    }
    if (lastHydratedConvRef.current === currentConversationId) return;
    const conversation = conversations.find((c) => c.id === currentConversationId);
    if (!conversation) return;
    lastHydratedConvRef.current = currentConversationId;
    hydrate(conversation.active_knowledge_base_ids ?? null);
  }, [currentConversationId, conversations, hydrate]);

  const activeIds = useMemo(() => new Set(activeKBIds), [activeKBIds]);
  const grouped = useMemo(
    () =>
      kbs.reduce<Record<KBScope, KnowledgeBase[]>>(
        (acc, kb) => {
          (acc[kb.scope] ??= []).push(kb);
          return acc;
        },
        { personal: [], org: [], app: [] },
      ),
    [kbs],
  );
  const sections = SECTION_ORDER.filter((s) => grouped[s].length > 0);
  const activeCount = activeIds.size;

  const handleKBToggle = async (kb: KnowledgeBase, checked: boolean) => {
    toggleKB(kb.id);
    if (currentConversationId) {
      const next = checked ? [...activeKBIds, kb.id] : activeKBIds.filter((id) => id !== kb.id);
      await updateActiveKBs(currentConversationId, next);
    }
  };

  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([
    { value: "", label: "Default" },
  ]);
  const [selectedModel, setSelectedModel] = useState<{ value: string; label: string }>({
    value: "",
    label: "Default",
  });

  useEffect(() => {
    // Fetch model list once on mount. `onModelChange` is intentionally NOT in
    // deps — parents (use-chat) pass an inline arrow each render, so depending
    // on it triggers a refetch every render → infinite loop during streaming.
    fetch("/api/v1/agent/models", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) {
          const models = [
            { value: "", label: `Default (${data.default})` },
            ...data.models.map((m: string) => ({ value: m, label: m })),
          ];
          setAvailableModels(models);
          setSelectedModel(models[0]);
        }
      })
      .catch(() => {});
  }, []);

  const [temperature, setTemperature] = useState<number | null>(null);
  const [effort, setEffort] = useState<ThinkingEffort>("off");
  const settingsOverridden = temperature !== null || effort !== "off";

  const triggerSummary = useMemo(() => {
    const parts: string[] = [];
    if (activeCount > 0) parts.push(`${activeCount} 个知识库`);
    if (selectedModel.value) parts.push(selectedModel.value);
    if (settingsOverridden) parts.push("自定义");
    return parts.length ? parts.join(" · ") : "控制";
  }, [activeCount, selectedModel, settingsOverridden]);

  const hasOverrides =
    activeCount > 0 || selectedModel.value !== "" || settingsOverridden;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="对话控制"
          className={cn(
            "border-foreground/10 bg-card hover:border-foreground/25 hover:bg-foreground/[0.04] inline-flex items-center gap-1.5 rounded-full border py-1 pr-2 pl-2.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
            hasOverrides ? "text-foreground" : "text-foreground/65",
          )}
        >
          <Sliders className="h-3 w-3" />
          <span className="max-w-[200px] truncate">{triggerSummary}</span>
          {hasOverrides && (
            <span aria-hidden className="bg-foreground inline-block h-1 w-1 rounded-full" />
          )}
          <ChevronDown className="text-foreground/45 h-3 w-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="border-border bg-popover relative w-[380px] overflow-hidden rounded-2xl border p-0 shadow-md"
      >
        <div className="border-foreground/10 flex items-center gap-1 border-b p-2">
          <TabButton icon={Database} label="知识库" active={tab === "kb"} onClick={() => setTab("kb")} />
          {onModelChange && (
            <TabButton
              icon={Cpu}
              label="模型"
              active={tab === "model"}
              onClick={() => setTab("model")}
            />
          )}
          {onTemperatureChange && onThinkingEffortChange && (
            <TabButton
              icon={Settings2}
              label="设置"
              active={tab === "settings"}
              onClick={() => setTab("settings")}
            />
          )}
        </div>

        <div className="max-h-[420px] scrollbar-thin overflow-y-auto p-4">
          {tab === "kb" && (
            <KBPanel
              sections={sections}
              grouped={grouped}
              activeIds={activeIds}
              kbs={kbs}
              isLoading={kbsLoading}
              currentConversationId={currentConversationId}
              onToggle={handleKBToggle}
            />
          )}
          {tab === "model" && (
            <ModelPanel
              models={availableModels}
              selected={selectedModel}
              onPick={(m) => {
                setSelectedModel(m);
                onModelChange?.(m.value || null);
              }}
            />
          )}
          {tab === "settings" && (
            <SettingsPanel
              temperature={temperature}
              effort={effort}
              onTemperatureChange={(v) => {
                setTemperature(v);
                onTemperatureChange?.(v);
              }}
              onEffortChange={(v) => {
                setEffort(v);
                onThinkingEffortChange?.(v === "off" ? null : v);
              }}
            />
          )}
        </div>

        <div className="border-foreground/10 text-foreground/45 flex items-center justify-between border-t px-4 py-2 font-mono text-[10px] tracking-wider uppercase">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="bg-foreground inline-block h-1 w-1 animate-pulse rounded-full"
            />
            {currentConversationId ? "已保存到当前对话" : "发送时保存"}
          </span>
          <span>按 esc 关闭</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
/** Knowledge bases panel — grouped by scope. */
function KBPanel({
  sections,
  grouped,
  activeIds,
  kbs,
  isLoading,
  currentConversationId,
  onToggle,
}: {
  sections: KBScope[];
  grouped: Record<KBScope, KnowledgeBase[]>;
  activeIds: Set<string>;
  kbs: KnowledgeBase[];
  isLoading: boolean;
  currentConversationId: string | null;
  onToggle: (kb: KnowledgeBase, checked: boolean) => void;
}) {
  const activeCount = activeIds.size;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-foreground text-sm font-semibold">知识库</p>
        <span className="text-foreground/55 font-mono text-[10px] tabular-nums">
          {activeCount}/{kbs.length} 已激活
        </span>
      </div>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">
        选中的知识库会在您发送消息时被检索。
      </p>

      {isLoading && kbs.length === 0 ? (
        <p className="text-foreground/55 py-3 text-xs">加载中…</p>
      ) : kbs.length === 0 ? (
        <div className="border-foreground/10 bg-foreground/[0.02] rounded-xl border px-4 py-6 text-center">
          <Database className="text-foreground/30 mx-auto mb-2 h-6 w-6" />
          <p className="text-foreground/65 text-xs">还没有知识库。</p>
          <p className="text-foreground/45 mt-1 text-[11px]">
            在知识库页面创建一个。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((scope) => {
            const meta = SCOPE_META[scope];
            return (
              <section key={scope}>
                <div className="text-foreground/55 mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </div>
                <ul className="space-y-1">
                  {grouped[scope].map((kb) => {
                    const isActive = activeIds.has(kb.id);
                    return (
                      <li key={kb.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-all",
                            isActive
                              ? "border-foreground/30 bg-accent"
                              : "border-border hover:border-foreground/25 hover:bg-accent/60",
                          )}
                        >
                          <Checkbox
                            checked={isActive}
                            onCheckedChange={(c) => onToggle(kb, c as boolean)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-xs font-medium">
                              {kb.name}
                            </p>
                            {kb.description && (
                              <p className="text-foreground/55 mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
                                {kb.description}
                              </p>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {!currentConversationId && kbs.length > 0 && (
        <p className="text-foreground/45 mt-4 font-mono text-[10px] tracking-wider uppercase">
          草稿选择——发送时保存。
        </p>
      )}
    </div>
  );
}

/** Model picker panel. */
function ModelPanel({
  models,
  selected,
  onPick,
}: {
  models: { value: string; label: string }[];
  selected: { value: string; label: string };
  onPick: (m: { value: string; label: string }) => void;
}) {
  return (
    <div>
      <p className="text-foreground mb-1 text-sm font-semibold">模型</p>
      <p className="text-foreground/55 mb-4 text-xs leading-relaxed">
        选择处理此对话的模型。
      </p>
      <ul className="space-y-1">
        {models.map((m) => {
          const isActive = selected.value === m.value;
          return (
            <li key={m.value || "default"}>
              <button
                type="button"
                onClick={() => onPick(m)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition-all",
                  isActive
                    ? "border-foreground/30 bg-accent text-foreground"
                    : "border-border text-foreground/75 hover:border-foreground/25 hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <span className="truncate font-medium">{m.label}</span>
                {isActive && <Check className="text-foreground h-3.5 w-3.5 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Chat settings panel — temperature + thinking effort. */
function SettingsPanel({
  temperature,
  effort,
  onTemperatureChange,
  onEffortChange,
}: {
  temperature: number | null;
  effort: ThinkingEffort;
  onTemperatureChange: (v: number | null) => void;
  onEffortChange: (v: ThinkingEffort) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="chat-temp" className="text-foreground text-sm font-semibold">
            温度
          </label>
          <span className="text-foreground font-mono text-xs tabular-nums">
            {temperature === null ? (
              <span className="text-foreground/55">默认</span>
            ) : (
              temperature.toFixed(2)
            )}
          </span>
        </div>
        <input
          id="chat-temp"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={temperature ?? 0.7}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          className="bg-foreground/15 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--color-brand)]"
        />
        <div className="text-foreground/45 flex justify-between font-mono text-[10px] tracking-wider uppercase">
          <span>聚焦</span>
          <span>创意</span>
        </div>
        {temperature !== null && (
          <button
            type="button"
            onClick={() => onTemperatureChange(null)}
            className="text-foreground/55 hover:text-foreground text-[11px] underline-offset-2 hover:underline"
          >
            重置为服务器默认值
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground text-sm font-semibold">思考力度</span>
          <span className="text-foreground/45 text-[10px]">取决于模型</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {EFFORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onEffortChange(opt.value)}
              className={cn(
                "rounded-lg px-2 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors",
                effort === opt.value
                  ? "bg-foreground text-background"
                  : "border-foreground/15 text-foreground/55 hover:text-foreground border",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-foreground/55 text-[11px]">
          {EFFORT_OPTIONS.find((o) => o.value === effort)?.hint}
        </p>
      </div>

      <p className="text-foreground/45 text-[10px] leading-relaxed">
        设置在当前会话中持续有效。部分模型可能不支持某些控制项。
      </p>
    </div>
  );
}
