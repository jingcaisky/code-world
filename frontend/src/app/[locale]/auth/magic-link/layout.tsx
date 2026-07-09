import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "登录",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0E0E0C",
};

export default function MagicLinkVerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
