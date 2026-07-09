"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Download,
  ExternalLink,
  HardDrive,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/dashboard/stat-card";
import { LoadingState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle, Badge, Button } from "@/components/ui";
import {
  useBilling,
  useCredits,
  useInvoices,
  useMembers,
  useOrganizations,
  useSubscription,
} from "@/hooks";
import { apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { cn, formatBytes, formatCurrency, formatDate } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  trialing: "试用中",
  active: "生效中",
  past_due: "已逾期",
  canceled: "已取消",
  unpaid: "未付款",
  incomplete: "未完成",
  incomplete_expired: "已过期",
  paused: "已暂停",
};

const STATUS_TONES: Record<string, string> = {
  trialing: "border-border text-muted-foreground",
  active: "border-border text-foreground",
  past_due: "border-yellow-500/40 text-yellow-600 dark:text-yellow-500",
  canceled: "border-destructive/40 text-destructive",
  unpaid: "border-destructive/40 text-destructive",
  incomplete: "border-border text-muted-foreground",
  incomplete_expired: "border-border text-muted-foreground",
  paused: "border-border text-muted-foreground",
};


export default function BillingOverviewPage() {
  const searchParams = useSearchParams();
  const { activeOrg, fetchOrgs } = useOrganizations();
  const { members } = useMembers(activeOrg?.id ?? "");
  const { subscription, isLoading: subLoading } = useSubscription();
  const { balance, isLoading: balanceLoading } = useCredits();
  const { invoices, isLoading: invoicesLoading } = useInvoices();
  const { openPortal, isLoading: portalLoading } = useBilling();
  const [storage, setStorage] = useState<{ total_bytes: number; limit_bytes: number } | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    apiClient
      .get<{ total_bytes: number; limit_bytes: number }>("/billing/me/storage")
      .then(setStorage)
      .catch(() => setStorage(null));
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "1") {
      toast.success("订阅已更新");
    }
  }, [searchParams]);

  const status = subscription?.status ?? "free";
  const statusLabel = STATUS_LABELS[status] ?? "Free";
  const statusTone = STATUS_TONES[status] ?? "border-border text-muted-foreground";
  const planName = subscription?.price?.plan?.display_name ?? "Free";
  const seatsUsed = members?.length ?? 0;
  const seatsLimit = subscription?.seats_quantity ?? activeOrg?.seats_limit ?? null;
  const lowBalance =
    balance && balance.low_threshold > 0 && balance.balance < balance.low_threshold;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => openPortal()} disabled={portalLoading} variant="outline" size="sm">
          {portalLoading ? (
            "打开中…"
          ) : (
            <>
              <ExternalLink className="h-3.5 w-3.5" />
              在 Stripe 中管理
            </>
          )}
        </Button>
      </div>

      {!balanceLoading && lowBalance && balance && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>余额较低</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {balance.balance.toLocaleString()} credits left, below your alert threshold of{" "}
              {balance.low_threshold.toLocaleString()}.
            </span>
            <Link
              href={ROUTES.BILLING_CREDITS}
              className="text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              去充值
              <ArrowRight className="h-3 w-3" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <section className="border-border bg-card rounded-xl border">
        <div className="grid gap-6 p-5 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                当前方案
              </span>
              <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", statusTone)}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">{planName}</p>
            {subscription ? (
              <p className="text-muted-foreground mt-1.5 text-sm">
                Renews{" "}
                <span className="text-foreground font-medium">
                  {formatDate(subscription.current_period_end)}
                </span>
                {subscription.cancel_at_period_end && (
                  <span className="text-destructive ml-2 font-mono text-[11px] tracking-wider uppercase">
                    · 到期后取消
                  </span>
                )}
              </p>
            ) : !subLoading ? (
              <p className="text-muted-foreground mt-1.5 text-sm">
                当前为免费方案。升级后可解锁更多额度、席位和集成。
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {!subscription ? (
              <Button asChild>
                <Link href={ROUTES.PRICING}>
                  查看方案
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={ROUTES.BILLING_SUBSCRIPTION}>管理方案</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {balanceLoading ? (
        <LoadingState variant="stats" rows={3} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="积分余额"
            value={(balance?.balance ?? 0).toLocaleString()}
            unit="credits"
            icon={Sparkles}
          />
          {seatsLimit !== null && (
            <StatCard
            label="席位"
              value={`${seatsUsed} / ${seatsLimit}`}
              icon={Users}
            />
          )}
          <StatCard
            label="已用存储"
            value={storage ? formatBytes(storage.total_bytes) : "—"}
            icon={HardDrive}
          />
        </div>
      )}

      <section className="border-border bg-card rounded-xl border">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-foreground text-sm font-semibold">最近发票</h2>
            <p className="text-muted-foreground text-xs">
              {invoices.length === 0
                ? "暂无发票"
                : `最近 ${Math.min(5, invoices.length)} / 共 ${invoices.length}`}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.BILLING_INVOICES}>查看全部</Link>
          </Button>
        </div>

        {invoicesLoading ? (
          <div className="p-5">
            <LoadingState variant="skeleton-list" rows={3} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-muted-foreground px-5 py-12 text-center text-sm">
            你的首个付费周期结束后，发票会显示在这里。
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {invoices.slice(0, 5).map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    {inv.number ?? `Invoice ${inv.id.slice(0, 8)}`}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-foreground text-sm font-semibold tabular-nums">
                    {formatCurrency(inv.amount_due, inv.currency)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wider uppercase">
                    {inv.status}
                  </p>
                </div>
                {inv.invoice_pdf && (
                  <Button asChild variant="ghost" size="icon" className="shrink-0">
                    <a
                      href={inv.invoice_pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="下载 PDF"
                      aria-label="下载发票 PDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
