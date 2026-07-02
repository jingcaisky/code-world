/**
 * Action: run-command
 *
 * Execute a shell command in the project directory and return output.
 * Captures stdout, stderr, and exit code.
 *
 * ⚠️ Security: Only allowed commands are whitelisted.
 * Running arbitrary commands is gated behind AGENT_NATIVE_ALLOW_UNSAFE_COMMANDS.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

/** Default timeout for commands (ms) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Max output bytes to capture */
const MAX_OUTPUT_BYTES = 50_000;

/** Safe commands allowed by default (read-only, no side effects) */
const SAFE_COMMANDS = new Set([
  "ls", "dir", "cat", "head", "tail", "wc", "grep", "find",
  "node", "npm", "pnpm", "yarn", "npx",
  "tsc", "tsgo", "eslint", "oxlint", "prettier",
  "vitest", "jest", "playwright",
  "git", "echo", "pwd", "which", "whoami", "env",
  "df", "du", "ps", "top", "htop",
]);

/** Check if a command is on the safe list */
function isSafeCommand(command: string): boolean {
  const base = command.split(/\s+/)[0]?.toLowerCase();
  return SAFE_COMMANDS.has(base ?? "");
}

export default defineAction({
  description: `在项目环境中执行Shell命令并返回输出。
默认只允许安全命令（如 git, npm, tsc, vitest 等）。
设置 AGENT_NATIVE_ALLOW_UNSAFE_COMMANDS=true 可放宽限制，但请谨慎使用。
输出有 50KB 上限，超过部分会被截断。
默认超时 30 秒。`,

  schema: z.object({
    command: z.string().describe("要执行的命令（如 'pnpm test'、'git diff'、'tsc --noEmit'）"),
    cwd: z.string().optional().describe("工作目录（默认：项目根目录）"),
    timeoutMs: z.number().min(1000).max(120000).optional().default(DEFAULT_TIMEOUT_MS)
      .describe("超时时间（毫秒）"),
  }),

  http: { method: "POST" },

  run: async ({ command, cwd, timeoutMs }) => {
    // Security check
    const allowUnsafe = process.env.AGENT_NATIVE_ALLOW_UNSAFE_COMMANDS === "true";
    if (!allowUnsafe && !isSafeCommand(command)) {
      return {
        error: `Command "${command.split(/\s+/)[0]}" is not in the safe list. Set AGENT_NATIVE_ALLOW_UNSAFE_COMMANDS=true to enable.`,
        safeList: [...SAFE_COMMANDS],
      };
    }

    const { exec } = await import("node:child_process");
    const nodePath = await import("node:path");

    const workDir = cwd ? nodePath.resolve(process.cwd(), cwd) : process.cwd();

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES * 2,
        shell: process.platform === "win32" ? "powershell" : "/bin/bash",
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: string) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += chunk;
        }
      });

      child.stderr?.on("data", (chunk: string) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += chunk;
        }
      });

      child.on("close", (code) => {
        const truncated = stdout.length >= MAX_OUTPUT_BYTES;
        resolve({
          command,
          cwd: workDir,
          exitCode: code,
          stdout: truncated ? stdout.slice(0, MAX_OUTPUT_BYTES) + "\n... (truncated)" : stdout,
          stderr: stderr.slice(0, 5000),
          truncated,
          success: code === 0,
        });
      });

      child.on("error", (err) => {
        resolve({
          command,
          cwd: workDir,
          exitCode: -1,
          stdout: "",
          stderr: err.message,
          success: false,
          error: err.message,
        });
      });
    });
  },
});
