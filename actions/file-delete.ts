/**
 * Action: file-delete
 *
 * Delete a file or empty directory from the project workspace.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `删除项目中的文件或空目录。删除前会确认文件存在。`,

  schema: z.object({
    path: z.string().describe("要删除的文件或目录路径"),
    dryRun: z.boolean().optional().default(false).describe("仅检查是否存在，不实际删除"),
  }),

  http: { method: "POST" },

  run: async ({ path: filePath, dryRun }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    const cwd = process.cwd();
    const resolved = nodePath.resolve(cwd, filePath);

    if (!resolved.startsWith(cwd)) {
      return { error: "Access denied: path is outside project directory", path: filePath };
    }

    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      return { error: "File not found", path: filePath, deleted: false };
    }

    if (stat.isDirectory()) {
      // Check if directory is empty
      const entries = await fs.readdir(resolved);
      if (entries.length > 0) {
        return {
          error: "Directory is not empty",
          path: filePath,
          entryCount: entries.length,
          entries: entries.slice(0, 10),
        };
      }
    }

    if (dryRun) {
      return {
        path: filePath,
        exists: true,
        type: stat.isDirectory() ? "directory" : "file",
        sizeBytes: stat.size,
        dryRun: true,
      };
    }

    await (stat.isDirectory() ? fs.rmdir(resolved) : fs.unlink(resolved));

    return {
      path: filePath,
      type: stat.isDirectory() ? "directory" : "file",
      sizeBytes: stat.size,
      deleted: true,
    };
  },
});
