import type { Metadata } from "next";

import { LoginForm } from "@/components/auth";
import type { Locale } from "@/i18n";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({
    title: "登录",
    description: "登录到你的工作区。",
    path: "/login",
    locale,
    noindex: true,
  });
}

export default function LoginPage() {
  return <LoginForm />;
}
