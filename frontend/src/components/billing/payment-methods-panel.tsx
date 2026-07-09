"use client";

import { CreditCard, Shield } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useBilling, useSubscription } from "@/hooks";

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  diners: "Diners Club",
};

export function PaymentMethodsPanel() {
  const { subscription, isLoading } = useSubscription();
  const { isLoading: billingLoading, openPortal } = useBilling();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>支付方式</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          支付方式
        </CardTitle>
        <CardDescription>支付方式通过 Stripe 进行安全管理。</CardDescription>
      </CardHeader>
      <CardContent>
        {subscription ? (
          <div className="bg-muted/30 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="bg-background text-muted-foreground flex h-9 w-14 items-center justify-center rounded-md border text-xs font-bold uppercase">
                {subscription.price?.currency?.toUpperCase() ?? "···"}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {subscription.status === "active" || subscription.status === "trialing"
                    ? "有效订阅"
                    : "Subscription on file"}
                </p>
                <p className="text-muted-foreground text-xs">
                  请使用账单门户更新你的支付方式。
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto shrink-0">
                由 Stripe 管理
              </Badge>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
            <Shield className="h-5 w-5 shrink-0" />
            <p>没有有效订阅。升级后即可添加支付方式。</p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={openPortal} disabled={billingLoading || !subscription}>
          {billingLoading ? "跳转中…" : "管理支付方式"}
        </Button>
      </CardFooter>
    </Card>
  );
}
