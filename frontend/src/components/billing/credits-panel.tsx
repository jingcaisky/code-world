"use client";

import { format } from "date-fns";
import { Coins, TrendingDown, TrendingUp } from "lucide-react";
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
import { useCredits, useBilling } from "@/hooks";

function TxTypeBadge({ type }: { type: string }) {
  const isPositive = type.startsWith("grant") || type === "topup";
  return (
    <Badge variant={isPositive ? "default" : "secondary"} className="text-xs">
      {type.replace(/_/g, " ")}
    </Badge>
  );
}

export function CreditsPanel() {
  const { balance, transactions, isLoading, txLoading } = useCredits();
  const { isLoading: billingLoading, startCheckout } = useBilling();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>额度</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const low = balance && balance.balance < balance.low_threshold;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              额度
            </CardTitle>
            {low && <Badge variant="destructive">余额不足</Badge>}
          </div>
          <CardDescription>AI 操作会消耗额度。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold tabular-nums">
            {balance?.balance.toLocaleString() ?? "—"}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">剩余额度</p>
          {low && (
            <p className="text-destructive mt-2 text-sm">
              Balance is below the alert threshold of {balance?.low_threshold.toLocaleString()}{" "}
              credits.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={() =>
              startCheckout({
                success_url: window.location.href + "?topup=1",
                cancel_url: window.location.href,
              })
            }
            disabled={billingLoading}
          >
            充值额度
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">交易历史记录</CardTitle>
          <CardDescription>你组织最近的额度消费活动。</CardDescription>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !transactions || transactions.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transactions yet.</p>
          ) : (
            <div className="divide-y">
              {transactions.items.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{tx.description ?? "Credit transaction"}</span>
                    <div className="flex items-center gap-2">
                      <TxTypeBadge type={tx.type} />
                      <span className="text-muted-foreground">
                        {format(new Date(tx.created_at), "MMM d, yyyy · HH:mm")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 font-mono font-medium">
                    {tx.delta > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={tx.delta > 0 ? "text-green-600" : "text-red-600"}>
                      {tx.delta > 0 ? "+" : ""}
                      {tx.delta.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
