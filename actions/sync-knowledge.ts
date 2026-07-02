/**
 * Action: sync-knowledge
 *
 * Manually synchronize AGENTS.md ↔ SQL Resources
 * and re-index project files into the Zvec vector database.
 *
 * Called by the Agent when it updates AGENTS.md or adds new files.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `同步知识库：AGENTS.md ↔ SQL Resource + 向量索引。
同步内容：
- AGENTS.md 写入 SQL Resources（Agent 可通过 resources 工具读写）
- 项目文件索引到向量数据库（zvec-search 可搜索）
- 返回同步结果摘要`,

  schema: z.object({
    reindex: z.boolean().optional().default(false)
      .describe("是否强制重建向量索引（默认仅增量）"),
  }),

  http: { method: "POST" },

  run: async ({ reindex }) => {
    if (reindex) process.env.AGENT_NATIVE_REINDEX = "true";

    const { syncAllKnowledge } = await import(
      "../server/lib/knowledge-sync"
    );

    const result = await syncAllKnowledge();

    if (reindex) delete process.env.AGENT_NATIVE_REINDEX;

    return {
      ...result,
      summary: [
        result.agentsMd.synced ? "✅ AGENTS.md synced to SQL" : "⚠️ AGENTS.md sync failed",
        result.vectorIndex.indexed > 0
          ? `✅ ${result.vectorIndex.indexed} files indexed (${result.vectorIndex.skipped} skipped)`
          : `📋 ${result.vectorIndex.skipped} files already indexed`,
        result.learnings.entries > 0
          ? `📝 ${result.learnings.entries} learnings active`
          : "",
      ].filter(Boolean).join(" | "),
    };
  },
});
