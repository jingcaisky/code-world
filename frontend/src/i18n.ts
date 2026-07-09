export const locales = ["zh", "en", "pl"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh";

export function getLocaleLabel(locale: Locale): string {
  const labels: Record<Locale, string> = {
    zh: "中文",
    en: "英文",
    pl: "波兰语",
  };
  return labels[locale];
}

export function getLocaleFlag(locale: Locale): string {
  const flags: Record<Locale, string> = {
    zh: "🇨🇳",
    en: "🇬🇧",
    pl: "🇵🇱",
  };
  return flags[locale];
}
