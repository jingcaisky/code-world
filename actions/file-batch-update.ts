/**
 * Action: file-batch-update
 * Batch update multiple files in one tool call.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `批量修改多个文件。每次指定一个文件列表，通过 patches 精确查找替换。
比逐个调用 file-update 效率高，改 10 个文件只需 1 次 tool call。`,
  schema: z.object({
    patches: z.array(z.object({
      path: z.string().describe("文件路径"),
      oldStr: z.string().describe("要查找的精确字符串"),
      newStr: z.string().describe("替换后的新字符串"),
    })).describe("批量补丁列表"),
  }),
  http: { method: "POST" },
  run: async ({ patches }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const cwd = process.cwd();
    const results: Array<{ path: string; changes: number; error?: string }> = [];

    for (const { path: fp, oldStr, newStr } of patches) {
      const resolved = nodePath.resolve(cwd, fp);
      if (!resolved.startsWith(cwd)) {
        results.push({ path: fp, changes: 0, error: "Access denied" });
        continue;
      }
      try {
        const original = await fs.readFile(resolved, "utf-8");
        if (!original.includes(oldStr)) {
          results.push({ path: fp, changes: 0, error: "oldStr not found" });
          continue;
        }
        const occurrences = original.split(oldStr).length - 1;
        const updated = original.split(oldStr).join(newStr);
        await fs.writeFile(resolved, updated, "utf-8");
        results.push({ path: fp, changes: occurrences });
      } catch (e) {
        results.push({ path: fp, changes: 0, error: String(e) });
      }
    }
    const totalChanges = results.reduce((s, r) => s + r.changes, 0);
    return { totalFiles: patches.length, totalChanges, results };
  },
});
