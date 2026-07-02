/**
 * Action: web-search
 *
 * Search the web for latest documentation, API changes, Stack Overflow
 * answers, and real-time technical information.
 *
 * Integrates with Tavily Search API as the default provider. Can be
 * swapped to SerpAPI, Bing, or Google via AGENT_NATIVE_WEB_SEARCH_PROVIDER.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 1: Parallel Search
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

// ── Configuration ─────────────────────────────────────────────────────

/** Web search provider (tavily | serpapi | bing) */
const PROVIDER = process.env.AGENT_NATIVE_WEB_SEARCH_PROVIDER ?? "tavily";

/** Tavily API key */
const TAVILY_API_KEY = process.env.AGENT_NATIVE_TAVILY_API_KEY ?? "";

/** Tavily Search endpoint */
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 2_000;

/** Maximum results to return */
const MAX_RESULTS = 8;

// ── Types ─────────────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
  query: string;
  response_time: number;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

// ── Tavily Provider ───────────────────────────────────────────────────

async function searchTavily(
  query: string,
  maxResults: number,
  signal: AbortSignal,
): Promise<WebSearchResult[]> {
  if (!TAVILY_API_KEY) {
    console.warn("[web-search] TAVILY_API_KEY not configured, search disabled");
    return [];
  }

  const response = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: Math.min(maxResults, MAX_RESULTS),
      include_answer: false,
      include_raw_content: false,
      include_domains: [
        "github.com",
        "stackoverflow.com",
        "docs.github.com",
        "developer.mozilla.org",
        "react.dev",
        "nodejs.org",
        "npmjs.com",
      ],
    }),
    signal,
  });

  if (!response.ok) {
    console.warn(`[web-search] Tavily API returned ${response.status}`);
    return [];
  }

  const data: TavilyResponse = await response.json();
  return data.results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.slice(0, 500),
    score: r.score,
  }));
}

// ── SerpAPI Provider (fallback) ───────────────────────────────────────

async function searchSerpApi(
  query: string,
  _maxResults: number,
  signal: AbortSignal,
): Promise<WebSearchResult[]> {
  const apiKey = process.env.AGENT_NATIVE_SERPAPI_KEY ?? "";
  if (!apiKey) {
    console.warn("[web-search] SERPAPI_KEY not configured");
    return [];
  }

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google",
    num: "5",
  });

  const response = await fetch(
    `https://serpapi.com/search?${params.toString()}`,
    { signal },
  );

  if (!response.ok) {
    console.warn(`[web-search] SerpAPI returned ${response.status}`);
    return [];
  }

  const data = await response.json();
  return ((data.organic_results as any[]) ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: (r.snippet ?? "").slice(0, 500),
    score: 0.5,
  }));
}

// ── Action Definition ─────────────────────────────────────────────────

export default defineAction({
  description: `搜索互联网获取最新技术文档、API 变更、Stack Overflow 问答和实时信息。
用于查找项目依赖的最新版本、框架 API 变化、已知问题解决方案等。
结果自动过滤技术相关的域名（GitHub、StackOverflow、MDN 等）。`,

  schema: z.object({
    query: z.string().describe("搜索查询文本，建议使用英文关键词"),
    maxResults: z
      .number()
      .min(1)
      .max(MAX_RESULTS)
      .default(5)
      .describe("返回的最大结果数量"),
    includeDomains: z
      .array(z.string())
      .optional()
      .describe("额外包含的域名过滤列表"),
  }),

  http: { method: "GET" },

  run: async ({ query, maxResults, includeDomains }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      let results: WebSearchResult[] = [];

      switch (PROVIDER) {
        case "tavily":
          results = await searchTavily(query, maxResults, controller.signal);
          break;
        case "serpapi":
          results = await searchSerpApi(query, maxResults, controller.signal);
          break;
        default:
          console.warn(
            `[web-search] Unknown provider "${PROVIDER}", falling back to tavily`,
          );
          results = await searchTavily(query, maxResults, controller.signal);
      }

      return {
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          score: r.score,
        })),
        total: results.length,
        provider: PROVIDER,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { results: [], total: 0, timeout: true };
      }
      console.error("[web-search] Unexpected error:", error);
      return { results: [], total: 0, error: String(error) };
    } finally {
      clearTimeout(timer);
    }
  },
});
