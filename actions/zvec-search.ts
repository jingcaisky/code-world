/**
 * Action: zvec-search (Hybrid Retriever)
 *
 * Semantic + keyword hybrid search across code, documentation, and FAQ.
 * Uses the hybrid retriever (keyword TF-IDF + Zvec semantic + RRF fusion).
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

// ── Action Definition ─────────────────────────────────────────────────

export default defineAction({
  description: `语义+关键词混合检索历史代码 / 文档 / FAQ。
通过混合检索（关键词TF-IDF + Zvec语义向量 + RRF融合排序），返回最相关的代码片段和文档。
scope 参数控制检索范围：code（代码）、docs（文档）、faq（常见问题）、all（全部）。
使用提示：初次使用前先运行 index-content Action 来索引项目文件。`,

  schema: z.object({
    query: z.string().describe("搜索查询文本，使用自然语言描述你要找的内容"),
    scope: z
      .enum(["code", "docs", "faq", "all"])
      .default("all")
      .describe("检索范围：code=代码, docs=文档, faq=FAQ, all=全部"),
    topK: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("返回的最相关结果数量"),
    minScore: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("最低相似度阈值（0-1），低于此分数的结果会被过滤"),
  }),

  http: { method: "GET" },

  run: async ({ query, scope, topK, minScore }) => {
    const startTime = Date.now();

    try {
      // Use hybrid retriever (keyword + semantic + RRF fusion)
      const { hybridSearch } = await import(
        "../server/lib/hybrid-retriever"
      );

      const resultSet = await hybridSearch(query, {
        topK,
        minScore: minScore ?? 0,
        scope,
      });

      const results = resultSet.results.map((r) => ({
        id: r.id,
        text: r.text,
        score: r.score,
        source: r.sourceType,
        file_path: r.filePath,
        // Hybrid-specific metadata
        found_by: r.foundBy,
        keyword_score: r.scores.keyword,
        semantic_score: r.scores.semantic,
      }));

      return {
        results,
        total: resultSet.total,
        latencyMs: Date.now() - startTime,
        backend: "hybrid",
        channels: resultSet.channels,
        search_latency: resultSet.latency,
      };
    } catch (error) {
      console.warn("[zvec-search] Hybrid search failed:", error);

      // Last-resort fallback to local TF-IDF only
      try {
        const { hasIndexedContent, searchVectorIndex } = await import(
          "../server/lib/vector-store"
        );

        const hasContent = await hasIndexedContent();
        if (!hasContent) {
          return {
            results: [],
            total: 0,
            latencyMs: Date.now() - startTime,
            backend: "fallback",
            error: "No indexed content. Run index-content first.",
          };
        }

        const localResults = await searchVectorIndex(query, {
          topK,
          minScore: minScore ?? 0.05,
          scope: scope === "all" ? undefined : scope,
        });

        return {
          results: localResults.map((r) => ({
            id: r.entry.id,
            text: r.entry.content.slice(0, 800),
            score: r.score,
            source: r.entry.sourceType,
            file_path: r.entry.sourceFile,
            found_by: "keyword",
            keyword_score: r.score,
            semantic_score: 0,
          })),
          total: localResults.length,
          latencyMs: Date.now() - startTime,
          backend: "fallback-local",
        };
      } catch (fallbackError) {
        return {
          results: [],
          total: 0,
          latencyMs: Date.now() - startTime,
          backend: "error",
          error: String(error),
        };
      }
    }
  },
});
