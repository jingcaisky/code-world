/**
 * Search Orchestrator — Layer 1
 *
 * Orchestrates multi-channel search:
 * - HYBRID (Pre-L0): keyword TF-IDF + Zvec semantic fused with RRF
 * - MCP: precise file content retrieval
 * - WEB: external documentation search
 *
 * Results feed into triage service for RAG-enhanced classification.
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

import {
  ZVEC_SEARCH_TIMEOUT_MS,
  MCP_FILE_READ_TIMEOUT_MS,
  WEB_SEARCH_TIMEOUT_MS,
  SEARCH_MIN_WAIT_MS,
  SEARCH_RESULTS_BUDGET,
} from "../../config/const";
import { truncateSearchResults } from "./token-budget";

// ── Types ─────────────────────────────────────────────────────────────

export type SearchChannelStatus =
  | "complete"
  | "partial"
  | "pending"
  | "skipped"
  | "error";

export interface SearchChannelResult {
  channel: "hybrid" | "zvec" | "mcp" | "web";
  status: SearchChannelStatus;
  results: SearchResultItem[];
  error?: string;
  latencyMs: number;
}

export interface SearchResultItem {
  text: string;
  priority: number; // 0-1, higher = more relevant
  source: string; // source identifier (file path, URL, etc.)
  channel: "hybrid" | "zvec" | "mcp" | "web";
}

export interface SearchStatus {
  hybrid?: SearchChannelStatus;
  zvec?: SearchChannelStatus;
  mcp: SearchChannelStatus;
  web: SearchChannelStatus;
}

export interface SearchOrchestratorResult {
  /** Formatted search results for prompt injection */
  sharedContext: string;
  /** Individual channel results for debugging */
  channels: SearchChannelResult[];
  /** Status summary */
  status: SearchStatus;
  /** Total latency (ms) */
  totalLatencyMs: number;
}

// ── Search Execution ───────────────────────────────────────────────────

/**
 * Run a single search channel with timeout.
 * For "hybrid" and "zvec" channels, uses the hybrid-retriever
 * (keyword + semantic RRF fusion). Falls back to HTTP API if needed.
 */
async function runChannel(
  channel: "hybrid" | "zvec" | "mcp" | "web",
  query: string,
  timeoutMs: number,
): Promise<SearchChannelResult> {
  const startTime = Date.now();

  // ── Hybrid/Zvec: Use Pre-L0 hybrid retriever ──
  if (channel === "hybrid" || channel === "zvec") {
    try {
      const { hybridSearch } = await import("./hybrid-retriever");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resultSet = await hybridSearch(query, {
        topK: 10,
        minScore: 0,
        scope: "all",
      });

      clearTimeout(timer);

      const items: SearchResultItem[] = resultSet.results.map((r) => ({
        text: `[${r.sourceType}] ${r.filePath}: ${r.text.slice(0, 600)}`,
        priority: r.score,
        source: r.filePath,
        channel: "hybrid",
      }));

      // Add channel metadata item
      items.unshift({
        text: `Hybrid search: ${resultSet.total} results (${resultSet.channels.keyword ? "keyword" : ""}${resultSet.channels.keyword && resultSet.channels.semantic ? "+" : ""}${resultSet.channels.semantic ? "semantic" : ""}) in ${resultSet.latency.totalMs}ms`,
        priority: 1.0,
        source: "search-meta",
        channel: "hybrid",
      });

      return {
        channel: "hybrid",
        status: "complete",
        results: items,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && error.name === "AbortError";
      return {
        channel: "hybrid",
        status: isTimeout ? "partial" : "error",
        results: [],
        error: isTimeout ? "Timeout" : String(error),
        latencyMs: timeoutMs,
      };
    }
  }

  // ── MCP / Web: HTTP-based search ──
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = buildChannelUrl(channel, query);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: buildChannelHeaders(channel),
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        channel,
        status: "error",
        results: [],
        error: `HTTP ${response.status}`,
        latencyMs: Date.now() - startTime,
      };
    }

    const data = await response.json();
    const items = parseChannelResults(channel, data);

    return {
      channel,
      status: "complete",
      results: items,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const isTimeout =
      error instanceof DOMException && error.name === "AbortError";
    return {
      channel,
      status: isTimeout ? "partial" : "error",
      results: [],
      error: isTimeout ? "Timeout" : String(error),
      latencyMs: timeoutMs,
    };
  }
}

// ── URL/Headers Builders ───────────────────────────────────────────────

function buildChannelUrl(channel: string, query: string): string {
  const base =
    process.env.AGENT_NATIVE_API_BASE ?? "http://localhost:8080";
  const encoded = encodeURIComponent(query);

  switch (channel) {
    case "hybrid":
    case "zvec":
      return `${base}/_agent-native/actions/zvec-search?query=${encoded}`;
    case "mcp":
      return `${base}/_agent-native/actions/mcp-file-read?path=&query=${encoded}`;
    case "web":
      return `${base}/_agent-native/actions/web-search?query=${encoded}`;
    default:
      return "";
  }
}

function buildChannelHeaders(channel: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Search-Channel": channel,
  };
}

// ── Result Parsers ─────────────────────────────────────────────────────

function parseChannelResults(
  channel: string,
  data: unknown,
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const obj = data as Record<string, unknown>;

  if (!obj?.results || !Array.isArray(obj.results)) return [];

  for (const r of obj.results as any[]) {
    const source =
      r.source ?? r.file_path ?? r.url ?? r.title ?? "unknown";
    const text = r.text ?? r.content ?? r.snippet ?? "";

    if (!text.trim()) continue;

    items.push({
      text: text.slice(0, 1000), // Individual result cap
      priority: typeof r.score === "number" ? r.score : 0.5,
      source: String(source),
      channel: channel as "hybrid" | "mcp" | "web",
    });
  }

  return items;
}

// ── Orchestrator ────────────────────────────────────────────────────────

/**
 * Orchestrate parallel multi-channel search.
 *
 * 1. Fire all 3 channels in parallel
 * 2. Wait SEARCH_MIN_WAIT_MS for fast results
 * 3. Return whatever has arrived + status for pending channels
 * 4. Late results are available via channelResults
 */
export async function orchestrateSearch(
  query: string,
  options?: {
    timeoutOverrides?: Partial<Record<"hybrid" | "zvec" | "mcp" | "web", number>>;
    minWaitMs?: number;
  },
): Promise<SearchOrchestratorResult> {
  const startTime = Date.now();

  // Fire all channels in parallel: hybrid (keyword+semantic) + mcp + web
  const [hybridResult, mcpResult, webResult] = await Promise.all([
    runChannel(
      "hybrid",
      query,
      options?.timeoutOverrides?.hybrid ?? options?.timeoutOverrides?.zvec ?? ZVEC_SEARCH_TIMEOUT_MS + 500,
    ),
    runChannel(
      "mcp",
      query,
      options?.timeoutOverrides?.mcp ?? MCP_FILE_READ_TIMEOUT_MS,
    ),
    runChannel(
      "web",
      query,
      options?.timeoutOverrides?.web ?? WEB_SEARCH_TIMEOUT_MS,
    ),
  ]);

  // Aggregate results
  const allResults: SearchResultItem[] = [
    ...hybridResult.results,
    ...mcpResult.results,
    ...webResult.results,
  ];

  // Sort by priority descending
  allResults.sort((a, b) => b.priority - a.priority);

  // Truncate to search results budget
  const sharedContext = truncateSearchResults(
    allResults.map((r) => ({ text: r.text, priority: r.priority })),
    SEARCH_RESULTS_BUDGET,
  );

  const status: SearchStatus = {
    hybrid: hybridResult.status,
    mcp: mcpResult.status,
    web: webResult.status,
  };

  return {
    sharedContext,
    channels: [hybridResult, mcpResult, webResult],
    status,
    totalLatencyMs: Date.now() - startTime,
  };
}

/**
 * Create a minimal "pending" search status.
 * Used when the triage fires before any search results arrive.
 */
export function pendingSearchStatus(): SearchOrchestratorResult {
  return {
    sharedContext: "",
    channels: [],
    status: { mcp: "pending", web: "pending" },
    totalLatencyMs: 0,
  };
}
