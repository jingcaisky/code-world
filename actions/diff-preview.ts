/**
 * Action: diff-preview
 * Show diff of current changes against git HEAD.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `查看当前工作区文件变更预览（git diff）。
显示文件级别和内容级别的变更，用于 AI 改代码前确认修改范围，或用户查看改了什么。`,
  schema: z.object({
    file: z.string().optional().describe("指定文件路径，不指定则显示全部变更"),
    staged: z.boolean().optional().default(false),
  }),
  http: { method: "GET" },
  run: async ({ file, staged }) => {
    const { exec } = await import("node:child_process");
    const target = file ? `"${file}"` : "";
    const cmd = staged ? `git diff --staged ${target}` : `git diff ${target}`;
    return new Promise((resolve) => {
      exec(cmd, { cwd: process.cwd(), timeout: 10000, maxBuffer: 50000 }, (_err, stdout) => {
        const files = new Set<string>();
        for (const line of stdout.split("\n")) {
          const m = line.match(/^diff --git a\/(.+) b\/(.+)/);
          if (m) files.add(m[1]);
        }
        resolve({
          diff: stdout.slice(0, 6000),
          filesChanged: [...files],
          truncated: stdout.length > 6000,
        });
      });
    });
  },
});
