/**
 * Action: index-content
 *
 * Index project files into the vector database for semantic search.
 * Supports indexing individual files, directories, or the entire project.
 *
 * Part of: Integration Plan Phase 1.4
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import {
  indexFile,
  indexFiles,
  indexProject,
  indexFile as indexSingle,
} from "../server/lib/content-indexer";
import { getEntryCount, getIDFStats } from "../server/lib/embedder";

export default defineAction({
  description: `将项目文件索引到向量数据库，支持语义检索。
可索引单个文件、文件列表或整个项目。
索引后的内容可通过 zvec-search 进行语义搜索。`,

  schema: z.object({
    mode: z
      .enum(["file", "files", "project"])
      .default("project")
      .describe("索引模式：file=单个文件，files=文件列表，project=整个项目"),
    file: z
      .string()
      .optional()
      .describe("文件路径（mode=file 时必需）"),
    files: z
      .array(z.string())
      .optional()
      .describe("文件路径列表（mode=files 时必需）"),
    maxFiles: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .default(100)
      .describe("最大索引文件数（mode=project 时有效）"),
    sourceType: z
      .enum(["code", "docs", "faq"])
      .optional()
      .describe("强制指定内容类型（默认从路径推断）"),
  }),

  http: { method: "POST" },

  run: async ({ mode, file, files, maxFiles, sourceType }) => {
    const options = sourceType ? { sourceType } : {};

    switch (mode) {
      case "file": {
        if (!file) {
          return { error: "file is required for mode=file" };
        }
        const result = await indexFile(file, process.cwd(), options);
        return {
          mode: "file",
          result,
          totalIndexed: await getTotalIndexed(),
        };
      }

      case "files": {
        if (!files || files.length === 0) {
          return { error: "files array is required for mode=files" };
        }
        const { results, totalChunks, errors } = await indexFiles(
          files,
          process.cwd(),
          options,
        );
        return {
          mode: "files",
          results: results.slice(0, 20), // Return first 20, too many otherwise
          totalFiles: files.length,
          totalChunks,
          errors,
          totalIndexed: await getTotalIndexed(),
        };
      }

      case "project": {
        const { totalFiles, totalChunks, errors, preExisting } =
          await indexProject(process.cwd(), {
            maxFiles,
            ...options,
          });
        return {
          mode: "project",
          totalFiles,
          totalChunks,
          errors,
          preExisting,
          totalIndexed: await getTotalIndexed(),
        };
      }

      default:
        return { error: `Unknown mode: ${mode}` };
    }
  },
});

async function getTotalIndexed(): Promise<{
  entries: number;
  idfDocuments: number;
  idfTokens: number;
}> {
  const entries = await getEntryCount();
  const idfStats = getIDFStats();
  return {
    entries,
    idfDocuments: idfStats.documentCount,
    idfTokens: idfStats.tokenCount,
  };
}
