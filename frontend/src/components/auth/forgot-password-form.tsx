"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";

import { Button, Input, Label } from "@/components/ui";
import { apiClient, ApiError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/utils";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setError("请输入有效的邮箱地址");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      await apiClient.post("/auth/password-reset/request", { email });
    } catch (err) {
      // Treat "not found" the same as success to avoid email enumeration.
      if (err instanceof ApiError && err.status >= 500) {
        setError("出了点问题，请重试。");
        setIsLoading(false);
        return;
      }
    }
    setSubmitted(true);
    setIsLoading(false);
  };

  if (submitted) {
    return (
      <div className="space-y-7 text-center">
        <div
          className="bg-brand/15 mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ boxShadow: "0 0 32px oklch(from var(--color-brand) l c h / 0.35)" }}
        >
          <Mail className="text-foreground h-6 w-6" />
        </div>
        <div className="space-y-2">
          <span className="eyebrow text-foreground/55">请查收邮箱</span>
          <h1 className="text-display-md text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
            链接已发送。<em>正在路上。</em>
          </h1>
          <p className="text-foreground/70 text-sm">
            如果 <span className="text-foreground font-medium">{email}</span> 对应的账号存在，
            你很快会收到重置链接。链接 1 小时后过期。
          </p>
        </div>
        <Link
          href={ROUTES.LOGIN}
          className="text-foreground/65 hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <span className="eyebrow text-foreground/55">忘记密码？</span>
        <h1 className="text-display-md text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
          这事谁都可能遇到。<em>别担心。</em>
        </h1>
        <p className="text-foreground/65 text-sm">
          在下方填写邮箱，我们会发送一次性链接帮你设置新密码。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-foreground/80 text-xs font-medium tracking-wider uppercase"
          >
            {t("email")}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
            className="h-12 rounded-xl"
          />
        </div>

        {error && (
          <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="bg-foreground text-background hover:bg-foreground/90 h-12 w-full rounded-full text-base font-medium"
        >
          {isLoading ? (
            "发送中…"
          ) : (
            <>
              发送重置链接
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>

        <Link
          href={ROUTES.LOGIN}
          className="text-foreground/55 hover:text-foreground mt-2 inline-flex items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          返回登录
        </Link>
      </form>
    </div>
  );
}
