import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import type { Locale } from "@/i18n";
import { ROUTES } from "@/lib/constants";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({
    title: "Set a new password",
    description: "Reset your account password.",
    path: "/reset-password",
    locale,
    noindex: true,
  });
}

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <span className="eyebrow text-foreground/55">重置密码</span>
          <h1 className="text-display-md text-foreground">链接失效或已过期</h1>
          <p className="text-foreground/70 text-sm">
            此页面需要重置邮件中的 Token。请请求新链接以继续。
          </p>
        </div>
        <Link
          href={ROUTES.FORGOT_PASSWORD}
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors"
        >
          请求新链接
        </Link>
        <p className="text-foreground/55 text-xs">
          Or{" "}
          <Link
            href={ROUTES.LOGIN}
            className="text-foreground hover:text-foreground/80 underline-offset-4 hover:underline"
          >
            返回登录
          </Link>
          .
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
