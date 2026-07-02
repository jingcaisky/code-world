/**
 * Action: git-ops
 *
 * Execute safe Git operations: status, diff, commit, branch, log.
 * All operations are read-only by default; commit requires explicit confirmation.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `执行常用 Git 操作。
支持的操作：status（状态）、diff（差异）、commit（提交）、branch（分支）、log（日志）。
commit 操作需要传入 confirm=true 才会执行，防止误操作。`,

  schema: z.object({
    operation: z.enum(["status", "diff", "commit", "branch", "log"])
      .describe("Git 操作类型"),
    // diff
    staged: z.boolean().optional().default(false).describe("diff 是否只看暂存区（staged changes）"),
    // commit
    message: z.string().optional().describe("提交信息（operation=commit 时必需）"),
    files: z.array(z.string()).optional().describe("提交的文件列表（operation=commit 时可选，不指定则提交全部）"),
    confirm: z.boolean().optional().default(false).describe("确认执行（operation=commit 时设为 true 才执行）"),
    // branch
    branchName: z.string().optional().describe("分支名称（operation=branch 时必需）"),
    branchAction: z.enum(["list", "create", "switch"]).optional().default("list")
      .describe("分支操作：list=列出, create=创建, switch=切换"),
    // log
    maxCount: z.number().min(1).max(50).optional().default(10).describe("日志最大条数"),
  }),

  http: { method: "GET" },

  run: async (params) => {
    const { exec } = await import("node:child_process");

    let cmd: string;
    switch (params.operation) {
      case "status":
        cmd = "git status --short --branch 2>&1";
        break;

      case "diff":
        cmd = params.staged
          ? "git diff --staged --stat 2>&1"
          : "git diff --stat 2>&1";
        // Also get detailed diff
        break;

      case "commit":
        if (!params.confirm) {
          return {
            note: "commit requires confirm=true. Set confirm=true to proceed.",
            operation: "commit",
          };
        }
        if (!params.message) {
          return { error: "message is required for commit operation" };
        }
        const fileArgs = params.files?.length
          ? params.files.map((f) => `"${f}"`).join(" ")
          : "-A";
        cmd = `git add ${fileArgs} && git commit -m "${params.message.replace(/"/g, '\\"')}" 2>&1`;
        break;

      case "branch":
        switch (params.branchAction) {
          case "create":
            if (!params.branchName) return { error: "branchName is required for create" };
            cmd = `git checkout -b ${params.branchName} 2>&1`;
            break;
          case "switch":
            if (!params.branchName) return { error: "branchName is required for switch" };
            cmd = `git checkout ${params.branchName} 2>&1`;
            break;
          case "list":
          default:
            cmd = "git branch --list --sort=-committerdate 2>&1";
            break;
        }
        break;

      case "log":
        cmd = `git log --oneline -${params.maxCount ?? 10} 2>&1`;
        break;

      default:
        return { error: "Unknown operation" };
    }

    return new Promise((resolve) => {
      const child = exec(cmd, {
        cwd: process.cwd(),
        timeout: 15_000,
        maxBuffer: 100_000,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

      child.on("close", (code) => {
        // Parse diff to get file list + stats
        let files: string[] = [];
        if (params.operation === "diff" || params.operation === "status") {
          files = parseChangedFiles(stdout);
        }

        resolve({
          operation: params.operation,
          success: code === 0,
          output: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 1000),
          files,
        });
      });

      child.on("error", (err) => {
        resolve({
          operation: params.operation,
          success: false,
          error: err.message,
        });
      });
    });
  },
});

function parseChangedFiles(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => /^\s*[MADRCU?!]\s/.test(line) || line.startsWith("? "))
    .map((line) => line.replace(/^\s*[MADRCU?!\?]\s+/, "").trim())
    .filter(Boolean);
}
