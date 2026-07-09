import type { Metadata } from "next";
import {
  Download,
  Lock,
  Quote,
  RefreshCw,
  Search,
  Smartphone,
  ThumbsUp,
  Users,
  Workflow,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n";
import { pageMetadata } from "@/lib/seo";

import { CaseStudy } from "@/components/marketing/case-study";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { DataFlowDiagram } from "@/components/marketing/data-flow-diagram";
import { EnterpriseSecurity } from "@/components/marketing/enterprise-security";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { FeatureBento } from "@/components/marketing/feature-bento";
import { FeatureMockup } from "@/components/marketing/feature-mockup";
import { FinalCta } from "@/components/marketing/final-cta";
import { IntegrationsGrid } from "@/components/marketing/integrations-grid";
import { OutcomesBand } from "@/components/marketing/outcomes-band";
import {
  buildFooterColumns,
  buildFooterLegal,
  buildMarketingNav,
} from "@/components/marketing/footer-config";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LogosStrip } from "@/components/marketing/logos-strip";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Marquee } from "@/components/marketing/marquee";
import { PillNav } from "@/components/marketing/pill-nav";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SmoothScroll } from "@/components/marketing/smooth-scroll";
import { TestimonialGrid } from "@/components/marketing/testimonial-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { faqSchema, organizationSchema, websiteSchema } from "@/lib/schema-org";

const LOGOS = [
  { brand: "google" as const, name: "Google" },
  { brand: "microsoft" as const, name: "Microsoft" },
  { brand: "stripe" as const, name: "Stripe" },
  { brand: "notion" as const, name: "Notion" },
  { brand: "linear" as const, name: "Linear" },
  { brand: "vercel" as const, name: "Vercel" },
  { brand: "figma" as const, name: "Figma" },
  { brand: "loom" as const, name: "Loom" },
];

const MARQUEE_ITEMS = [
  "发现",
  "搜索",
  "总结",
  "决策",
  "连接",
  "自动化",
  "跟踪",
  "改进",
  "入驻",
  "分析",
  "翻译",
  "起草",
  "安排",
  "解决",
  "预测",
  "迭代",
];

const TESTIMONIALS = [
  {
    quote:
      "我们的团队能在几秒内找到答案，不必再在 Notion 和 Google Drive 里翻找。第一周就回本了。",
    name: "Marta Kowal",
    title: "运营负责人",
    company: "Northwind Labs",
  },
  {
    quote:
      "我们先在支持团队上线，接着销售也开始使用，后来所有人都想要权限。它总是不断给我们惊喜。",
    name: "Daniel Reyes",
    title: "客户成功副总裁",
    company: "Acme Studios",
  },
  {
    quote:
      "聊天功能很棒，但真正打动我的是分析控制台。我们终于能看见团队如何使用 AI 了。",
    name: "Priya Anand",
    title: "首席幕僚",
    company: "Helios",
  },
];

const PLANS = [
  {
    name: "入门版",
    price: "$0",
    cadence: "/月",
    description: "适合正在试用产品的个人。",
    features: ["每天 100 条消息", "1 个已连接数据源", "社区支持"],
    cta: { label: "免费开始", href: ROUTES.REGISTER },
  },
  {
    name: "专业版",
    price: "$29",
    cadence: "/用户/月",
    description: "适合需要真正开展工作的中小团队。",
    features: [
      "无限消息",
      "10 个已连接数据源",
      "邮件 + 在线支持",
      "工作流自动化",
    ],
    cta: { label: "开始 14 天试用", href: ROUTES.REGISTER },
    featured: true,
    badge: "最受欢迎",
  },
  {
    name: "企业版",
    price: "$99",
    cadence: "/用户/月",
    description: "适合跨团队推广的组织。",
    features: [
      "包含专业版全部功能",
      "单点登录 + 审计日志",
      "基于角色的访问控制",
      "专属成功经理",
    ],
    cta: { label: "联系销售", href: ROUTES.CONTACT },
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.landing" });
  return pageMetadata({
    title: APP_NAME,
    description: t("metaDescription"),
    path: "/",
    locale,
  });
}

export default async function HomePage() {
  const t = await getTranslations("marketing.landing");
  const tNav = await getTranslations("marketing");

  const navLinks = buildMarketingNav((k) => tNav(k));
  const footerColumns = buildFooterColumns((k) => tNav(k));
  const footerLegal = buildFooterLegal((k) => tNav(k));

  const heroStats = [
    { value: "10k", label: t("hero.stat_teams") },
    { value: "98%", label: t("hero.stat_speed") },
    { value: "24/7", label: t("hero.stat_uptime") },
  ];
  const faqItems = t.raw("faq.items") as { q: string; a: string }[];

  return (
    <>
      <SmoothScroll />
      <JsonLd data={[organizationSchema(), websiteSchema(), faqSchema(faqItems)]} />

      <PillNav
        brand={APP_NAME}
        links={navLinks}
        ctaLabel={tNav("nav.getStarted")}
        ctaHref={ROUTES.REGISTER}
        secondaryCta={{ label: tNav("nav.signIn"), href: ROUTES.LOGIN }}
      />

      <main id="main">
        <Hero
          eyebrow={t("hero.eyebrow")}
          title={
            <>
              {t("hero.titlePre")} <em>{t("hero.titleHighlight")}</em> <em>{t("hero.titleEm")}</em>
            </>
          }
          description={t("hero.description")}
          primaryCta={{ label: t("hero.ctaPrimary"), href: ROUTES.REGISTER }}
          secondaryCta={{ label: t("hero.ctaSecondary"), href: ROUTES.CONTACT }}
          ratingLabel={t("hero.ratingLabel")}
          trustNote={t("hero.trustNote")}
          stats={heroStats}
          theme="dark"
        />

        <Marquee items={MARQUEE_ITEMS} />

        <Section theme="light" padding="py-16 md:py-20">
          <Reveal>
            <LogosStrip label="受到各行各业团队信赖" logos={LOGOS} />
          </Reveal>
        </Section>

        <Section theme="dark" id="how">
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">工作方式</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              <em>三步</em>即可开始
            </h2>
          </div>
          <Reveal>
            <HowItWorks />
          </Reveal>
        </Section>

        <Section theme="light">
          <Reveal>
            <OutcomesBand />
          </Reveal>
        </Section>

        <Section theme="dark" id="features">
          <Reveal>
            <FeatureBento
              eyebrow="已连接的知识"
              title={
                <>
                  所有数据，一个<em>助手。</em>
                </>
              }
              description="从 Google Drive、Notion、Slack、S3 等同步。文件留在原处，我们负责索引并随时可答。"
              cta={{ label: "查看已连接的数据源", href: ROUTES.RAG }}
              mockup={<FeatureMockup kind="rag" className="max-w-none" />}
              mockupSide="left"
              stat={{ value: "20+", label: "已连接数据源" }}
              bullets={[
                {
                  icon: RefreshCw,
                  title: "始终保持最新",
                  body: "源端更新后，文档会自动重新索引。",
                },
                {
                  icon: Lock,
                  title: "精细权限控制",
                  body: "每个用户只能看到自己被允许查看的内容，绝不外泄。",
                },
                {
                  icon: Search,
                  title: "内置搜索",
                  body: "在一个搜索框里查遍所有连接的数据源。",
                },
              ]}
            />
          </Reveal>
        </Section>

        <Section theme="light">
          <Reveal>
            <FeatureBento
              eyebrow="AI 对话"
              title={
                <>
                  基于<em>你自己的工作</em>给出答案。
                </>
              }
              description="用自然语言提问，获得带引用的答案。助手会记住上下文，并随着你的工作变化而调整。"
              cta={{ label: "试用对话", href: ROUTES.CHAT }}
              mockup={<FeatureMockup kind="agents" className="max-w-none" />}
              mockupSide="right"
              stat={{ value: "100%", label: "答案都带来源引用" }}
              bullets={[
                {
                  icon: Quote,
                  title: "每次都标注来源",
                  body: "每个答案都会链接回它来源的文档或工单。",
                },
                {
                  icon: Workflow,
                  title: "多步推理",
                  body: "把复杂请求拆成步骤并逐步执行。",
                },
                {
                  icon: Smartphone,
                  title: "网页和移动端都可用",
                  body: "跨设备体验一致，并支持 Slack 和 Teams 集成。",
                },
              ]}
            />
          </Reveal>
        </Section>

        <Section theme="dark">
          <Reveal>
            <FeatureBento
              eyebrow="洞察"
              title={
                <>
                  了解团队<em>都在问什么。</em>
                </>
              }
              description="实时查看每个问题、每次评分和每次流程运行。找出缺口、发现高频用户，并证明 ROI。"
              cta={{ label: "查看控制台", href: ROUTES.DASHBOARD }}
              mockup={<FeatureMockup kind="billing" className="max-w-none" />}
              mockupSide="left"
              stat={{ value: "+18%", label: "平均月活跃度" }}
              bullets={[
                {
                  icon: Users,
                  title: "按团队或个人查看使用情况",
                  body: "下钻查看谁在获得价值，以及问题都集中在哪里。",
                },
                {
                  icon: ThumbsUp,
                  title: "质量反馈闭环",
                  body: "用户给答案打分，你可以看出哪里有效、哪里需要改进。",
                },
                {
                  icon: Download,
                  title: "导出到你的数据仓库",
                  body: "通过 API 将事件流式送到 BigQuery、Snowflake 或你的工具中。",
                },
              ]}
            />
          </Reveal>
        </Section>

        <Section theme="light" className="relative overflow-hidden">
          <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 -z-10" />
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">如何连接</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              数据流入，<em>答案返回。</em>
            </h2>
            <p className="text-foreground/70 mt-5 max-w-xl text-lg leading-relaxed">
              源文档、对话和云端文件会持续编入索引。每个答案都基于你的真实工作，并附带来源引用。
            </p>
          </div>
          <Reveal>
            <DataFlowDiagram />
          </Reveal>
        </Section>

        <Section theme="dark" id="security">
          <Reveal>
            <EnterpriseSecurity cta={{ label: "阅读安全概览", href: ROUTES.SECURITY }} />
          </Reveal>
        </Section>

        <Section theme="light">
          <Reveal>
            <IntegrationsGrid cta={{ label: "浏览全部集成", href: ROUTES.HELP }} />
          </Reveal>
        </Section>

        <Section theme="dark">
          <Reveal>
            <CaseStudy
              quote="我们替换了三个内部工具，把回答时间从几小时缩短到几秒。过去新员工入职要花一个月，现在一周就够了。"
              name="Marta Kowal"
              role="首席运营官"
              company="Northwind Labs"
              metrics={[
                { value: "−68%", label: "首次答复时间" },
                { value: "3×", label: "入职更快" },
                { value: "12 小时", label: "每人每周节省" },
              ]}
            />
          </Reveal>
        </Section>

        <Section theme="light">
          <div className="mb-14 text-center">
            <p className="eyebrow text-foreground/55 mb-4">{t("testimonials.eyebrow")}</p>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent mx-auto max-w-2xl [&_em]:font-normal [&_em]:italic">
              {t("testimonials.titlePre")} <em>{t("testimonials.titleEm")}</em>
            </h2>
          </div>
          <Reveal>
            <TestimonialGrid items={TESTIMONIALS} />
          </Reveal>
        </Section>

        <Section theme="light">
          <Reveal>
            <ComparisonTable
              brand={APP_NAME}
              alternatives={["Generic AI chat", "DIY / in-house"]}
              rows={[
                { feature: "Grounded in your own data", cells: ["yes", "no", "partial"] },
                { feature: "Citations on every answer", cells: ["yes", "no", "partial"] },
                { feature: "Connects to your tools", cells: ["yes", "partial", "partial"] },
                {
                  feature: "Enterprise security (SSO, audit)",
                  cells: ["yes", "partial", "partial"],
                },
                { feature: "Usage analytics & ROI", cells: ["yes", "no", "partial"] },
                { feature: "Live in minutes", cells: ["yes", "yes", "no"] },
                { feature: "Dedicated support", cells: ["yes", "no", "partial"] },
              ]}
            />
          </Reveal>
        </Section>

        <Section theme="dark" id="pricing">
          <div className="mb-14 max-w-2xl">
            <div className="mb-5">
              <span className="eyebrow-badge">{t("pricing.eyebrow")}</span>
            </div>
            <h2 className="text-display-lg text-foreground [&_em]:font-accent [&_em]:font-normal [&_em]:italic">
              {t("pricing.titlePre")} <em>{t("pricing.titleEm")}</em>
            </h2>
            <p className="text-foreground/70 mt-5 max-w-xl text-lg leading-relaxed">
              {t("pricing.subtitle")}
            </p>
          </div>
          <Reveal>
            <PricingTeaser plans={PLANS} fullPricingHref={ROUTES.PRICING} />
          </Reveal>
        </Section>

        <Section theme="light" id="faq">
          <div className="mb-14 text-center">
            <p className="eyebrow text-foreground/55 mb-4">{t("faq.eyebrow")}</p>
            <h2 className="text-display-lg text-foreground">{t("faq.title")}</h2>
          </div>
          <Reveal>
            <FaqAccordion
              items={faqItems.map((it) => ({ ...it, q: it.q.replace("{appName}", APP_NAME) }))}
            />
          </Reveal>
        </Section>

        <Section theme="light" padding="pb-24 md:pb-32">
          <Reveal>
            <FinalCta
              stat={{ value: t("finalCta.statValue"), label: t("finalCta.statLabel") }}
              title={
                <>
                  {t("finalCta.titlePre")} <em>{t("finalCta.titleEm")}</em>
                </>
              }
              description={t("finalCta.description")}
              primary={{ label: t("finalCta.primary"), href: ROUTES.REGISTER }}
              secondary={{ label: t("finalCta.secondary"), href: ROUTES.PRICING }}
            />
          </Reveal>
        </Section>
      </main>

      <MarketingFooter
        brand={APP_NAME}
        tagline={tNav("footer.tagline")}
        operationalLabel={tNav("footer.operational")}
        columns={footerColumns}
        legal={footerLegal}
      />
    </>
  );
}
