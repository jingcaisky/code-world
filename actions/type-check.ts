/**
 * Action: type-check
 *
 * Run TypeScript type checking on the project or specific files.
 * Returns structured error information.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `运行 TypeScript 类型检查。
不指定 files 时检查整个项目，指定 files 时只检查指定文件。
返回类型错误列表，包含文件名、行号、错误信息。`,

  schema: z.object({
    files: z.array(z.string()).optional().describe("要检查的文件列表，不指定则检查全部"),
  }),

  http: { method: "POST" },

  run: async ({ files }) => {
    const { exec } = await import("node:child_process");

    // Detect which compiler to use
    const compiler = await detectCompiler();

    let args: string;
    if (files && files.length > 0) {
      // Check specific files — tsc ignores files arg so we use --project with rootDir
      args = `${compiler} --noEmit --pretty false 2>&1`;
    } else {
      args = `${compiler} --noEmit --pretty false 2>&1`;
    }

    return new Promise((resolve) => {
      const child = exec(args, {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 200_000,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

      child.on("close", (code) => {
        const errors = parseTypeErrors(stdout + stderr, files);
        resolve({
          success: code === 0,
          errorCount: errors.length,
          errors: errors.slice(0, 20),
          hint: errors.length > 0 ? `Fix ${errors.length} type error(s) before proceeding` : "All type checks passed",
        });
      });

      child.on("error", (err) => {
        resolve({ success: false, errorCount: 1, errors: [{ message: err.message }] });
      });
    });
  },
});

async function detectCompiler(): Promise<string> {
  const fs = await import("node:fs/promises");
  try {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
    if (pkg.devDependencies?.["@typescript/native-preview"]) return "npx tsgo";
  } catch { /* ignore */ }
  return "npx tsc";
}

interface TypeError {
  file?: string;
  line?: number;
  col?: number;
  code?: string;
  message: string;
}

function parseTypeErrors(output: string, targetFiles?: string[]): TypeError[] {
  const errors: TypeError[] = [];
  const lines = output.split("\n");

  // Match: file.ts(line,col): error TS1234: message
  // Or: file.tsx(line,col): error TS
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const [, file, lineNum, col, code, message] = match;

      // Filter by target files if specified
      if (targetFiles && targetFiles.length > 0) {
        const matchesTarget = targetFiles.some((f) => file.includes(f));
        if (!matchesTarget) continue;
      }

      errors.push({
        file,
        line: parseInt(lineNum),
        col: parseInt(col),
        code,
        message: message.trim(),
      });
    }
  }

  return errors;
}
