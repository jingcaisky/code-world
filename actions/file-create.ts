/**
 * Action: file-create
 *
 * Create a new file in the project workspace.
 * Basic file creation — one of the most essential IDE operations.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `在项目中创建新文件。
支持所有文本格式（.ts, .tsx, .js, .jsx, .css, .json, .md 等）。
会自动创建不存在的父目录，如果文件已存在且 overwrite=false 则报错。`,

  schema: z.object({
    path: z.string().describe("文件路径（相对于项目根目录，如 src/components/Login.tsx）"),
    content: z.string().describe("文件内容"),
    overwrite: z.boolean().optional().default(false).describe("如果文件已存在，是否覆盖"),
  }),

  http: { method: "POST" },

  run: async ({ path: filePath, content, overwrite }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    const cwd = process.cwd();
    const resolved = nodePath.resolve(cwd, filePath);

    // Security: prevent writes outside the project directory
    if (!resolved.startsWith(cwd)) {
      return { error: "Access denied: path is outside project directory", path: filePath };
    }

    // Ensure parent directory exists
    const parentDir = nodePath.dirname(resolved);
    await fs.mkdir(parentDir, { recursive: true });

    // Check if file exists
    try {
      await fs.access(resolved);
      if (!overwrite) {
        return { error: "File already exists. Set overwrite=true to replace.", path: filePath };
      }
    } catch {
      // File doesn't exist — proceed
    }

    await fs.writeFile(resolved, content, "utf-8");

    const stat = await fs.stat(resolved);
    return {
      path: filePath,
      sizeBytes: stat.size,
      lines: content.split("\n").length,
      created: true,
    };
  },
});
