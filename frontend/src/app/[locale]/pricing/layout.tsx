import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import type { Locale } from "@/i18n";
import { APP_NAME } from "@/lib/constants";
import { softwareApplicationSchema } from "@/lib/schema-org";
import { pageMetadata, SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({
    title: "定价",
    description: "简单透明的方案，随团队一起成长。先免费开始，准备好再升级。试用无需信用卡。",
    path: "/pricing",
    locale,
  });
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={softwareApplicationSchema({
          name: APP_NAME,
          description: SITE.description,
          url: `${SITE.url}/pricing`,
          offers: [
            { price: "0", priceCurrency: "USD", name: "入门版" },
            { price: "29", priceCurrency: "USD", name: "专业版" },
            { price: "99", priceCurrency: "USD", name: "企业版" },
          ],
        })}
      />
      {children}
    </>
  );
}
