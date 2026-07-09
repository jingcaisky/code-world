"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Cpu, Eye, EyeOff, Plus, Trash2, Check, X } from "lucide-react";
import { Button, Input, Switch } from "@/components/ui";
import { SectionCard } from "@/components/settings/settings-section";
import { LoadingState } from "@/components/states";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  type ProviderRecord,
} from "@/lib/providers-api";
import { getErrorMessage } from "@/lib/utils";


function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProvidersSettingsPage() {
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  // Track which fields have been modified so we only send changed values
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listProviders();
      setProviders(items);
    } catch (err) {
      toast.error(getErrorMessage(err, "加载提供方配置失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markDirty = useCallback((fieldId?: string) => {
    if (fieldId) {
      setDirtyFields((prev) => new Set(prev).add(fieldId));
    }
  }, []);

  const handleToggle = (provider: ProviderRecord) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === provider.id ? { ...p, is_enabled: !p.is_enabled } : p)),
    );
    markDirty(provider.id);
  };

  const handleApiKeyChange = (id: string, apiKey: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, api_key: apiKey } : p)),
    );
    markDirty(id);
  };

  const handleBaseUrlChange = (id: string, baseUrl: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, base_url: baseUrl } : p)),
    );
    markDirty(id);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddCustom = async () => {
    const name = customName.trim();
    const url = customUrl.trim();
    if (!name) { toast.error("Provider name is required"); return; }
    if (!url) { toast.error("Provider URL is required"); return; }
    try { new URL(url); } catch { toast.error("Please enter a valid URL"); return; }

    try {
      const created = await createProvider({ name, base_url: url });
      setProviders((prev) => [...prev, created]);
      setCustomName("");
      setCustomUrl("");
      setShowCustomForm(false);
      toast.success(`Provider "${name}" added`);
    } catch (err) {
      toast.error(getErrorMessage(err, "添加提供方失败"));
    }
  };

  const handleRemoveCustom = async (id: string) => {
    const provider = providers.find((p) => p.id === id);
    try {
      await deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      setDirtyFields((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast.success(`Provider "${provider?.name ?? ""}" removed`);
    } catch (err) {
      toast.error(getErrorMessage(err, "移除提供方失败"));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises = providers
        .filter((p) => dirtyFields.has(p.id))
        .map((p) => {
          const patch: Record<string, unknown> = {};
          // Compare with known state — send the current values
          // The backend PATCH only applies fields that are sent
          patch.is_enabled = p.is_enabled;
          patch.base_url = p.base_url;
          patch.api_key = p.api_key;
          return updateProvider(p.id, patch);
        });
      await Promise.all(promises);
      await load(); // Re-fetch to ensure we're in sync
      setDirtyFields(new Set());
      toast.success("Provider configuration saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "保存提供方配置失败"));
    } finally {
      setSaving(false);
    }
  };

  const presetProviders = providers.filter((p) => p.is_preset);
  const customProviders = providers.filter((p) => !p.is_preset);
  const enabledCount = providers.filter((p) => p.is_enabled).length;
  const hasDirty = dirtyFields.size > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionCard title="AI 提供方配置" description="正在加载你的提供方配置...">
          <LoadingState variant="stats" rows={6} />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="AI 提供方配置"
        description={`配置你工作区可用的 AI 模型提供方。已启用 ${enabledCount}/${providers.length} 个。`}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={!hasDirty || saving} size="sm">
              {saving ? "保存中..." : "保存更改"}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Preset providers */}
          <div className="space-y-3">
            <h3 className="text-foreground/55 font-mono text-[10px] tracking-wider uppercase">
              预设提供商
            </h3>
            <div className="border-border divide-border divide-y overflow-hidden rounded-xl border">
              {presetProviders.map((provider) => {
                const isVisible = visibleKeys.has(provider.id);
                return (
                  <div key={provider.id} className="hover:bg-accent/50 transition-colors">
                    <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                      <span className="bg-muted text-muted-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-wider">
                        {getInitials(provider.name)}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-foreground text-sm font-medium">
                              {provider.name}
                            </p>
                            <p className="text-muted-foreground mt-0.5 truncate text-xs font-mono">
                              {provider.base_url}
                            </p>
                          </div>
                          <Switch
                            checked={provider.is_enabled}
                            onCheckedChange={() => handleToggle(provider)}
                            aria-label={`Enable ${provider.name}`}
                          />
                        </div>
                        {provider.is_enabled && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`url-${provider.id}`}
                                className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase"
                              >
                                API 地址
                              </label>
                              <Input
                                id={`url-${provider.id}`}
                                value={provider.base_url}
                                onChange={(e) => handleBaseUrlChange(provider.id, e.target.value)}
                                className="font-mono text-xs"
                              />
                            </div>
                            <div className="flex-1 min-w-0 relative">
                              <label
                                htmlFor={`key-${provider.id}`}
                                className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase"
                              >
                                API 密钥
                              </label>
                              <div className="relative">
                                <Input
                                  id={`key-${provider.id}`}
                                  type={isVisible ? "text" : "password"}
                                  value={provider.api_key}
                                  onChange={(e) => handleApiKeyChange(provider.id, e.target.value)}
                                  placeholder="sk-..."
                                  className="font-mono text-xs pr-8"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleKeyVisibility(provider.id)}
                                  className="text-muted-foreground hover:text-foreground absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                                  aria-label={isVisible ? "Hide API key" : "Show API key"}
                                >
                                  {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom providers */}
          {customProviders.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-foreground/55 font-mono text-[10px] tracking-wider uppercase">
                自定义提供商
              </h3>
              <div className="border-border divide-border divide-y overflow-hidden rounded-xl border">
                {customProviders.map((provider) => {
                  const isVisible = visibleKeys.has(provider.id);
                  return (
                    <div key={provider.id} className="hover:bg-accent/50 transition-colors group">
                      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                        <span className="bg-muted text-muted-foreground inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-wider">
                          {getInitials(provider.name)}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-foreground text-sm font-medium">{provider.name}</p>
                              <p className="text-muted-foreground mt-0.5 truncate text-xs font-mono">{provider.base_url}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={provider.is_enabled}
                                onCheckedChange={() => handleToggle(provider)}
                                aria-label={`Enable ${provider.name}`}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveCustom(provider.id)}
                                className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                aria-label={`Remove ${provider.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {provider.is_enabled && (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                              <div className="flex-1 min-w-0">
                                <label htmlFor={`curl-${provider.id}`} className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase">API 地址</label>
                                <Input id={`curl-${provider.id}`} value={provider.base_url} onChange={(e) => handleBaseUrlChange(provider.id, e.target.value)} className="font-mono text-xs" />
                              </div>
                              <div className="flex-1 min-w-0 relative">
                                <label htmlFor={`ckey-${provider.id}`} className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase">API 密钥</label>
                                <div className="relative">
                                  <Input id={`ckey-${provider.id}`} type={isVisible ? "text" : "password"} value={provider.api_key} onChange={(e) => handleApiKeyChange(provider.id, e.target.value)} placeholder="sk-..." className="font-mono text-xs pr-8" />
                                  <button type="button" onClick={() => toggleKeyVisibility(provider.id)} className="text-muted-foreground hover:text-foreground absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors" aria-label={isVisible ? "Hide API key" : "Show API key"}>
                                    {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add custom provider */}
          {showCustomForm ? (
            <div className="border-border bg-accent/30 rounded-xl border p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Cpu className="text-muted-foreground h-4 w-4" />
                <span className="text-foreground text-sm font-medium">自定义提供商</span>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="custom-name" className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase">提供商名称</label>
                  <Input id="custom-name" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. My Custom LLM" className="text-sm" />
                </div>
                <div>
                  <label htmlFor="custom-url" className="text-foreground/55 mb-1 block text-[11px] font-medium tracking-wide uppercase">API 地址</label>
                  <Input id="custom-url" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://api.example.com/v1" className="font-mono text-xs" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleAddCustom}>
                    <Check className="h-3.5 w-3.5" /> 添加提供商
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowCustomForm(false); setCustomName(""); setCustomUrl(""); }}>
                    <X className="h-3.5 w-3.5" /> 取消
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowCustomForm(true)} className="w-full">
              <Plus className="h-4 w-4" /> 添加自定义提供商
            </Button>
          )}
        </div>

        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          Provider configurations are saved to your account and synced across devices.
          API keys are stored encrypted at rest on the server. Changes take effect immediately.
        </p>
      </SectionCard>
    </div>
  );
}
