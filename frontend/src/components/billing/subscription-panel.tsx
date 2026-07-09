"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSubscription, useBilling } from "@/hooks";
import { formatCurrency } from "@/lib/utils";
import { SeatSelectorDialog } from "./seat-selector-dialog";
import type { SubscriptionRead } from "@/types";

function StatusBadge({ status }: { status: SubscriptionRead["status"] }) {
  const map: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    active: { label: "生效中", variant: "default" },
    trialing: { label: "试用中", variant: "secondary" },
    past_due: { label: "已逾期", variant: "destructive" },
    canceled: { label: "已取消", variant: "outline" },
    unpaid: { label: "未付款", variant: "destructive" },
    paused: { label: "已暂停", variant: "secondary" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

function StatusIcon({ status }: { status: SubscriptionRead["status"] }) {
  if (status === "active") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "trialing") return <Clock className="h-5 w-5 text-blue-500" />;
  if (status === "canceled") return <XCircle className="text-muted-foreground h-5 w-5" />;
  return <AlertCircle className="text-destructive h-5 w-5" />;
}

export function SubscriptionPanel() {
  const { subscription, isLoading, cancelSubscription, reactivateSubscription, updateSeats } =
    useSubscription();
  const { isLoading: billingLoading, openPortal, startCheckout } = useBilling();
  const [canceling, setCanceling] = useState(false);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>订阅</CardTitle>
          <CardDescription>正在加载订阅详情…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-24 animate-pulse rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>暂无有效订阅</CardTitle>
          <CardDescription>升级后可解锁高级功能。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            你当前使用的是免费方案。选择一个方案即可开始。
          </p>
        </CardContent>
        <CardFooter>
          <Button
            onClick={() =>
              startCheckout({
                success_url: window.location.href + "?success=1",
                cancel_url: window.location.href,
              })
            }
            disabled={billingLoading}
          >
            查看方案
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const planName = subscription.price?.plan?.display_name ?? "订阅";
  const periodEnd = format(new Date(subscription.current_period_end), "MMM d, yyyy");
  const trialEnd = subscription.trial_end
    ? format(new Date(subscription.trial_end), "MMM d, yyyy")
    : null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon status={subscription.status} />
              <CardTitle>{planName}</CardTitle>
            </div>
            <StatusBadge status={subscription.status} />
          </div>
          <CardDescription>
            {subscription.status === "trialing" && trialEnd
              ? `试用期于 ${trialEnd} 结束`
              : `将于 ${periodEnd} 续订`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">席位</p>
              <p className="font-medium">{subscription.seats_quantity}</p>
            </div>
            {subscription.price && (
              <div>
                <p className="text-muted-foreground">价格</p>
                <p className="font-medium">
                  {formatCurrency(subscription.price.amount_cents, subscription.price.currency)}{" "}
                  / {subscription.price.interval}
                </p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">计费周期结束</p>
              <p className="font-medium">{periodEnd}</p>
            </div>
            <div>
              <p className="text-muted-foreground">自动续订</p>
              <p className="font-medium">{subscription.cancel_at_period_end ? "关闭" : "开启"}</p>
            </div>
          </div>

          {subscription.cancel_at_period_end && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                你的订阅将在 <strong>{periodEnd}</strong> 取消。在此之前仍可继续使用。
              </AlertDescription>
            </Alert>
          )}

          {subscription.status === "past_due" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                上次付款失败。请更新支付方式，以免服务中断。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button variant="outline" onClick={openPortal} disabled={billingLoading}>
            管理账单
          </Button>

          <Button
            variant="outline"
            onClick={() => setSeatDialogOpen(true)}
            disabled={billingLoading}
          >
            调整席位
          </Button>

          {subscription.cancel_at_period_end ? (
            <Button onClick={reactivateSubscription} disabled={billingLoading}>
              重新启用
            </Button>
          ) : subscription.status !== "canceled" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                取消订阅
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>取消订阅？</AlertDialogTitle>
                  <AlertDialogDescription>
                    你的订阅会一直有效到 <strong>{periodEnd}</strong>，随后自动取消。你可以在
                    该日期前随时重新启用。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>保留订阅</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      setCanceling(true);
                      await cancelSubscription();
                      setCanceling(false);
                    }}
                    disabled={canceling}
                  >
                  是，取消
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardFooter>
      </Card>

      <SeatSelectorDialog
        open={seatDialogOpen}
        onOpenChange={setSeatDialogOpen}
        mode="update"
        initialSeats={subscription.seats_quantity}
        onUpdate={updateSeats}
      />
    </>
  );
}
