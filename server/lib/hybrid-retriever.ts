/**
 * Hybrid Retriever — Pre-Layer 0
 *
 * Combines two retrieval strategies and fuses their results:
 * 1. KEYWORD (TF-IDF): Precise code token matching from local vector-store
 * 2. SEMANTIC (Zvec):  Embedding-based semantic search from remote Zvec API
 *
 * Fusion: Reciprocal Rank Fusion (RRF) for combining ranked lists.
 * RRF = Σ 1/(k + rank_i) for each document across all sources
 *
 * Priority: keyword (exact matches) > semantic (conceptual matches)
 * for code search, but semantic gets higher weight for natural language queries.
 *
 * Part of: Code World — Hybrid Retrieval Architecture (Pre-L0)
 */

import { searchVectorIndex, hasIndexedContent } from "./vector-store";
import { semanticSearch, HAS_REMOTE_ZVEC, checkZvecStatus, type ZvecSearchResult } from "./zvec-client";

// ── Types ────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  /** Unique document identifier */
  id: string;
  /** Text content snippet */
  text: string;
  /** Source file path */
  filePath: string;
  /** Content type */
  sourceType: string;
  /** RRF fusion score (0-1) */
  score: number;
  /** Individual component scores for debugging */
  scores: {
    keyword: number;
    semantic: number;
    fusion: number;
  };
  /** Which retriever found this result */
  foundBy: "keyword" | "semantic" | "both";
  /** Chunk index within the source file */
  chunkIndex: number;
}

export interface HybridSearchOptions {
  /** Top-K results to return */
  topK?: number;
  /** Minimum fusion score threshold */
  minScore?: number;
  /** Scope filter */
  scope?: "code" | "docs" | "faq" | "all";
  /** Weight for keyword results (0-1). Higher = prefer exact matches */
  keywordWeight?: number;
  /** Weight for semantic results (0-1). Higher = prefer concept matches */
  semanticWeight?: number;
  /** Search type hint for weight auto-adjustment */
  queryType?: "code" | "natural_language" | "auto";
}

export interface HybridSearchResultSet {
  results: HybridSearchResult[];
  total: number;
  /** Latency breakdown per channel */
  latency: {
    keywordMs: number;
    semanticMs: number;
    fusionMs: number;
    totalMs: number;
  };
  /** Which channels were used */
  channels: {
    keyword: boolean;
    semantic: boolean;
  };
}

// ── RRF Fusion ────────────────────────────────────────────────────────

/** RRF constant k — dampens high-ranked items */
const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: combines multiple ranked lists into one.
 */
function rrfFusion(
  rankedLists: Array<Array<{ id: string; score: number }>>,
): Map<string, number> {
  const fusionScores = new Map<string, number>();

  for (const list of rankedLists) {
    for (let i = 0; i < list.length; i++) {
      const rrf = 1 / (RRF_K + i + 1);
      const current = fusionScores.get(list[i].id) ?? 0;
      fusionScores.set(list[i].id, current + rrf);
    }
  }

  return fusionScores;
}

/**
 * Detect query type: code (symbol-heavy) vs natural language.
 * Used to auto-adjust keyword vs semantic weights.
 */
function detectQueryType(query: string): "code" | "natural_language" {
  const codePatterns = [
    /\w+\.\w+/,             // dot notation: user.login
    /\w+\(.*\)/,            // function call: useState()
    /\b[A-Z][a-z]+[A-Z]\w*\b/, // PascalCase: MyComponent
    /^[A-Z_]+\b/,           // CONSTANT_CASE
    /\bimport\b.*\bfrom\b/, // import ... from ...
    /\bexport\b/,           // export
    /[{}()\[\];]/,           // code syntax characters
  ];

  const codeHits = codePatterns.filter((p) => p.test(query)).length;
  return codeHits >= 2 ? "code" : "natural_language";
}

// ── Search Channels ────────────────────────────────────────────────────

/**
 * Keyword search via local TF-IDF vector store.
 */
async function keywordSearch(
  query: string,
  scope: string | undefined,
  topK: number,
): Promise<Array<{ id: string; text: string; filePath: string; sourceType: string; score: number; chunkIndex: number }>> {
  const startTime = Date.now();

  try {
    const hasContent = await hasIndexedContent();
    if (!hasContent) return [];

    const results = await searchVectorIndex(query, {
      topK: Math.min(topK * 2, 20), // Fetch more for fusion
      minScore: 0.01,
      scope,
    });

    return results.map((r) => ({
      id: r.entry.id,
      text: r.entry.content.slice(0, 800),
      filePath: r.entry.sourceFile,
      sourceType: r.entry.sourceType,
      score: r.score,
      chunkIndex: r.entry.chunkIndex,
    }));
  } catch (error) {
    console.warn("[hybrid] Keyword search failed:", error);
    return [];
  }
}

/**
 * Semantic search via Zvec API.
 */
async function zvecSemanticSearch(
  query: string,
  scope: string | undefined,
  topK: number,
): Promise<Array<{ id: string; text: string; filePath: string; sourceType: string; score: number; chunkIndex: number }>> {
  if (!HAS_REMOTE_ZVEC) return [];

  try {
    const results = await semanticSearch(query, {
      topK: Math.min(topK * 2, 20),
      minScore: 0.2,
      scope,
    });

    return results.map((r) => ({
      id: r.id,
      text: r.text.slice(0, 800),
      filePath: r.metadata?.source_file ?? r.metadata?.file_path ?? r.id,
      sourceType: r.metadata?.source_type ?? "code",
      score: r.score,
      chunkIndex: parseInt(r.metadata?.chunk_index ?? "0", 10),
    }));
  } catch (error) {
    console.warn("[hybrid] Semantic search failed:", error);
    return [];
  }
}

// ── Main Hybrid Search ────────────────────────────────────────────────

/**
 * Hybrid search: keyword + semantic fused with RRF.
 *
 * This is the Pre-L0 retrieval — called BEFORE context assembly
 * so results can enrich the system prompt and RAG context.
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResultSet> {
  const totalStart = Date.now();
  const topK = options.topK ?? 10;
  const scope = options.scope === "all" ? undefined : options.scope;

  // Auto-detect query type for weight tuning
  const queryType = options.queryType ?? detectQueryType(query);

  // Weights: code queries favor keyword, natural language favors semantic
  const kwWeight = options.keywordWeight ?? (queryType === "code" ? 0.7 : 0.4);
  const semWeight = options.semanticWeight ?? (queryType === "code" ? 0.3 : 0.6);

  // Run both channels in parallel
  const kwStart = Date.now();
  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch(query, scope, topK),
    zvecSemanticSearch(query, scope, topK),
  ]);
  const kwLatency = Date.now() - kwStart;
  const semLatency = (HAS_REMOTE_ZVEC ? kwLatency : 0); // semantic runs in parallel

  // Build ranked lists for RRF, applying per-channel weights
  const keywordRanked = keywordResults.map((r, i) => ({
    id: r.id,
    score: r.score * kwWeight,
  }));
  const semanticRanked = semanticResults.map((r, i) => ({
    id: r.id,
    score: r.score * semWeight,
  }));

  const fusionStart = Date.now();
  const fusionScores = rrfFusion([keywordRanked, semanticRanked]);

  // Build result map: key = normalized id (filePath#chunk)
  const resultMap = new Map<string, {
    kw: (typeof keywordResults)[0] | null;
    sem: (typeof semanticResults)[0] | null;
  }>();

  for (const r of keywordResults) {
    const key = `${r.filePath}#${r.chunkIndex}`;
    if (!resultMap.has(key)) resultMap.set(key, { kw: null, sem: null });
    resultMap.get(key)!.kw = r;
  }
  for (const r of semanticResults) {
    const key = `${r.filePath}#${r.chunkIndex}`;
    if (!resultMap.has(key)) resultMap.set(key, { kw: null, sem: null });
    resultMap.get(key)!.sem = r;
  }

  // Build final results
  const hybridResults: HybridSearchResult[] = [];
  const entryScores = new Map<string, number>();

  // Collect all unique entry IDs with their fusion scores
  for (const r of keywordResults) entryScores.set(r.id, fusionScores.get(r.id) ?? 0);
  for (const r of semanticResults) entryScores.set(r.id, fusionScores.get(r.id) ?? 0);

  for (const [fileKey, sources] of resultMap) {
    const primary = sources.kw ?? sources.sem;
    if (!primary) continue;

    // Use primary entry's ID for fusion score lookup
    const fusionScore = Math.max(
      sources.kw ? (fusionScores.get(sources.kw.id) ?? 0) : 0,
      sources.sem ? (fusionScores.get(sources.sem.id) ?? 0) : 0,
    );

    const kwScore = sources.kw?.score ?? 0;
    const semScore = sources.sem?.score ?? 0;
    const foundBy = sources.kw && sources.sem ? "both" : sources.kw ? "keyword" : "semantic";

    hybridResults.push({
      id: primary.id,
      text: primary.text,
      filePath: primary.filePath,
      sourceType: primary.sourceType,
      score: fusionScore,
      scores: {
        keyword: kwScore,
        semantic: semScore,
        fusion: fusionScore,
      },
      foundBy,
      chunkIndex: primary.chunkIndex,
    });
  }

  // Sort by fusion score descending
  hybridResults.sort((a, b) => b.score - a.score);

  // Apply min score filter
  const minScore = options.minScore ?? 0;
  const filtered = hybridResults.filter((r) => r.score >= minScore);

  // Truncate to topK
  const finalResults = filtered.slice(0, topK);

  return {
    results: finalResults,
    total: filtered.length,
    latency: {
      keywordMs: kwLatency,
      semanticMs: semLatency,
      fusionMs: Date.now() - fusionStart,
      totalMs: Date.now() - totalStart,
    },
    channels: {
      keyword: keywordResults.length > 0,
      semantic: semanticResults.length > 0,
    },
  };
}

/**
 * Format hybrid search results into a compact string for RAG injection.
 * Used by context-assembler and triage-service for enriched prompts.
 */
export function formatHybridResultsForRAG(
  resultSet: HybridSearchResultSet,
  maxTokens: number = 2000,
): string {
  if (resultSet.results.length === 0) return "";

  const parts: string[] = [
    `## Relevant Context (Hybrid Search: ${resultSet.channels.keyword ? "keyword" : ""}${resultSet.channels.keyword && resultSet.channels.semantic ? " + " : ""}${resultSet.channels.semantic ? "semantic" : ""})`,
    "",
  ];

  let totalChars = parts.join("\n").length;

  for (const r of resultSet.results) {
    const tag = r.foundBy === "both" ? "🔍📊" : r.foundBy === "keyword" ? "🔍" : "📊";
    const line = `### ${tag} ${r.filePath} (score: ${r.score.toFixed(3)}, chunk ${r.chunkIndex})\n\`\`\`\n${r.text}\n\`\`\`\n`;
    if (totalChars + line.length > maxTokens * 4) break;
    parts.push(line);
    totalChars += line.length;
  }

  return parts.join("\n");
}

/**
 * Get status summary for hybrid retriever.
 */
export async function getHybridStatus(): Promise<{
  keywordStore: { entries: number; ready: boolean };
  semanticStore: { configured: boolean; connected: boolean; documents: number };
}> {
  const { getEntryCount } = await import("./vector-store");
  const keywordEntries = await getEntryCount();

  let zvecStatus = { configured: false, connected: false, documents: 0 };
  if (HAS_REMOTE_ZVEC) {
    try {
      const status = await checkZvecStatus();
      zvecStatus = {
        configured: true,
        connected: status.status === "connected",
        documents: status.documentCount,
      };
    } catch { /* ignore */ }
  }

  return {
    keywordStore: { entries: keywordEntries, ready: keywordEntries > 0 },
    semanticStore: zvecStatus,
  };
}
