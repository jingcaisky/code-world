/**
 * Action: lint-fix
 *
 * Run linter with auto-fix on specified files.
 * Uses oxlint (primary) or eslint (fallback) based on project config.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `运行代码检查并自动修复可修复的问题。
使用项目配置的 oxlint 或 eslint。
返回修复前后的变更统计。`,

  schema: z.object({
    files: z.array(z.string()).optional().describe("要 lint 的文件列表，不指定则检查全部"),
    fix: z.boolean().optional().default(true).describe("是否自动修复（默认 true）"),
  }),

  http: { method: "POST" },

  run: async ({ files, fix }) => {
    const { exec } = await import("node:child_process");

    const linter = await detectLinter();
    const fixFlag = fix ? (linter === "oxlint" ? "--fix" : "--fix") : "";
    const filesArg = files?.length ? files.join(" ") : ".";

    const cmd = `npx ${linter} ${filesArg} ${fixFlag} --format json 2>&1`;

    return new Promise((resolve) => {
      const child = exec(cmd, {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 100_000,
      });

      let output = "";
      child.stdout?.on("data", (chunk: string) => { output += chunk; });

      child.on("close", (code) => {
        const results = parseLintResults(output, linter);
        resolve({
          linter,
          fixed: fix,
          exitCode: code,
          ...results,
        });
      });

      child.on("error", (err) => {
        resolve({ linter, fixed: fix, errorCount: 1, errors: [{ message: err.message }] });
      });
    });
  },
});

async function detectLinter(): Promise<string> {
  const fs = await import("node:fs/promises");
  try {
    // Check for oxlint config
    await fs.access(".oxlintrc.json");
    return "oxlint";
  } catch {
    return "eslint";
  }
}

function parseLintResults(output: string, linter: string) {
  const errors: Array<{ file?: string; line?: number; message: string; fixable: boolean }> = [];
  let fixable = 0;

  try {
    if (linter === "oxlint") {
      const data = JSON.parse(output);
      for (const file of data.files ?? []) {
        for (const diag of file.diagnostics ?? []) {
          const isFixable = diag.fix ? true : false;
          if (isFixable) fixable++;
          errors.push({
            file: file.filePath ?? file.file,
            line: diag.line,
            message: diag.message ?? String(diag),
            fixable: isFixable,
          });
        }
      }
    } else {
      const data = JSON.parse(output);
      for (const result of data) {
        for (const msg of result.messages ?? []) {
          const isFixable = msg.fix ? true : false;
          if (isFixable) fixable++;
          errors.push({
            file: result.filePath,
            line: msg.line,
            message: msg.message,
            fixable: isFixable,
          });
        }
      }
    }
  } catch {
    // Non-JSON output
  }

  return {
    errorCount: errors.length,
    fixableCount: fixable,
    warnings: errors.filter((e) => !e.fixable).length,
    errors: errors.slice(0, 15),
    hint: errors.length === 0 ? "No lint issues found" : `${errors.length} issue(s), ${fixable} auto-fixable`,
  };
}
