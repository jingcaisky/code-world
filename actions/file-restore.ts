/**
 * Action: file-restore
 * Restore file to git HEAD state (undo changes).
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `将文件恢复到 Git HEAD 或暂存区状态。用于撤销误修改。`,
  schema: z.object({
    path: z.string().describe("要恢复的文件路径"),
    staged: z.boolean().optional().default(false).describe("从暂存区恢复（默认从 HEAD 恢复）"),
  }),
  http: { method: "POST" },
  run: async ({ path: fp, staged }) => {
    const { exec } = await import("node:child_process");
    const cmd = staged ? `git restore --staged "${fp}"` : `git checkout -- "${fp}"`;
    return new Promise((resolve) => {
      exec(cmd, { cwd: process.cwd(), timeout: 5000 }, (err, stdout, stderr) => {
        resolve({ path: fp, restored: !err, error: err?.message, output: stdout || stderr });
      });
    });
  },
});
