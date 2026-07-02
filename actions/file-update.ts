/**
 * Action: file-update
 *
 * Update an existing file with partial or full content replacement.
 * Supports line-range patching and string replacement modes.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `修改现有文件的全部或部分内容。
支持三种模式：
- replace: 全文替换（content 参数直接替换整个文件）
- patch: 查找并替换（oldStr → newStr，支持精确匹配替换）  
- append: 在文件末尾追加内容`,

  schema: z.object({
    path: z.string().describe("要修改的文件路径"),
    mode: z.enum(["replace", "patch", "append"]).default("patch")
      .describe("修改模式：replace=全文替换, patch=精确查找替换, append=追加"),
    content: z.string().optional()
      .describe("新内容（mode=replace/append 时使用）"),
    oldStr: z.string().optional()
      .describe("要查找的旧字符串（mode=patch 时使用，需精确匹配）"),
    newStr: z.string().optional()
      .describe("替换后的新字符串（mode=patch 时使用）"),
  }),

  http: { method: "POST" },

  run: async ({ path: filePath, mode, content, oldStr, newStr }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    const cwd = process.cwd();
    const resolved = nodePath.resolve(cwd, filePath);

    if (!resolved.startsWith(cwd)) {
      return { error: "Access denied: path is outside project directory", path: filePath };
    }

    let original: string;
    try {
      original = await fs.readFile(resolved, "utf-8");
    } catch {
      return { error: "File not found", path: filePath };
    }

    let updated: string;
    let changes = 0;

    switch (mode) {
      case "replace": {
        if (content === undefined) {
          return { error: "content is required for replace mode" };
        }
        updated = content;
        changes = original === updated ? 0 : 1;
        break;
      }

      case "patch": {
        if (!oldStr || newStr === undefined) {
          return { error: "oldStr and newStr are required for patch mode" };
        }
        if (!original.includes(oldStr)) {
          return { error: `oldStr not found in file. Double-check exact whitespace and indentation.`, path: filePath };
        }
        // Count occurrences and replace all
        const occurrences = original.split(oldStr).length - 1;
        updated = original.split(oldStr).join(newStr);
        changes = occurrences;
        break;
      }

      case "append": {
        if (content === undefined) {
          return { error: "content is required for append mode" };
        }
        updated = original.trimEnd() + "\n" + content;
        changes = 1;
        break;
      }

      default:
        return { error: `Unknown mode: ${mode}` };
    }

    await fs.writeFile(resolved, updated, "utf-8");
    const stat = await fs.stat(resolved);

    return {
      path: filePath,
      mode,
      changes,
      originalLines: original.split("\n").length,
      updatedLines: updated.split("\n").length,
      sizeBytes: stat.size,
    };
  },
});
