/**
 * Action: run-test
 *
 * Run project tests and return structured results.
 * Wraps vitest / jest with parseable output.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `运行项目测试并返回结构化结果。
默认运行所有测试，可通过 file 参数指定单个测试文件。
返回通过/失败统计、失败测试详情和执行时间。`,

  schema: z.object({
    file: z.string().optional().describe("指定测试文件路径（相对路径），不指定则运行全部"),
    watch: z.boolean().optional().default(false).describe("监听模式（不适用于此 Action，忽略）"),
  }),

  http: { method: "GET" },

  run: async ({ file }) => {
    const { exec } = await import("node:child_process");

    // Detect test runner from package.json
    const testCmd = await detectTestRunner();

    const args = file
      ? `${testCmd} run ${file} --reporter=verbose --reporter=json`
      : `${testCmd} run --reporter=verbose --reporter=json`;

    return new Promise((resolve) => {
      const child = exec(args, {
        cwd: process.cwd(),
        timeout: 60_000,
        maxBuffer: 100_000,
        env: { ...process.env, CI: "true" },
      });

      let stdout = "";
      child.stdout?.on("data", (chunk: string) => { stdout += chunk; });

      child.on("close", (code) => {
        const results = parseTestResults(stdout, testCmd);
        resolve({
          command: args,
          exitCode: code,
          ...results,
        });
      });

      child.on("error", (err) => {
        resolve({
          command: args,
          exitCode: -1,
          passed: 0,
          failed: 1,
          error: err.message,
        });
      });
    });
  },
});

/** Detect which test runner to use */
async function detectTestRunner(): Promise<string> {
  const fs = await import("node:fs/promises");
  try {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
    if (pkg.devDependencies?.["vitest"]) return "npx vitest";
    if (pkg.devDependencies?.["jest"]) return "npx jest";
  } catch { /* ignore */ }
  return "npx vitest"; // Default
}

/** Parse test output for structured results */
function parseTestResults(stdout: string, _runner: string) {
  const lines = stdout.split("\n");
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; file?: string; message?: string }> = [];

  // Parse vitest output
  for (const line of lines) {
    // Match vitest format: " ✓ test name" or " × test name"
    if (line.trim().startsWith("✓")) passed++;
    if (line.trim().startsWith("×") || line.trim().startsWith("✗")) {
      failed++;
      const name = line.replace(/^[×✗]\s*/, "").trim();
      failures.push({ name: name.slice(0, 100) });
    }
    // Match "Tests: 5 passed, 2 failed, 7 total"
    const testSummary = line.match(/Tests?:\s*(\d+)\s*(?:passed|failed)/i);
    if (testSummary) {
      const passedMatch = line.match(/(\d+)\s+passed/);
      const failedMatch = line.match(/(\d+)\s+failed/);
      if (passedMatch) passed = parseInt(passedMatch[1]);
      if (failedMatch) failed = parseInt(failedMatch[1]);
    }
  }

  return {
    passed,
    failed,
    total: passed + failed,
    failures: failures.slice(0, 10),
    rawOutput: stdout.slice(-2000), // Last 2000 chars of output
  };
}
