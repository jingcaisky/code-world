/**
 * Action: format-code
 *
 * Format code using the project's configured formatter (prettier/biome/oxfmt).
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `格式化代码文件，使用项目配置的格式化工具。
自动检测 prettier/biome/oxfmt 配置。
返回格式化前后的文件状态。`,

  schema: z.object({
    files: z.array(z.string()).describe("要格式化的文件路径列表"),
    check: z.boolean().optional().default(false).describe("仅检查而不修改（dry-run）"),
  }),

  http: { method: "POST" },

  run: async ({ files, check }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const { exec } = await import("node:child_process");

    const formatter = await detectFormatter();
    const cwd = process.cwd();

    // If check mode, use --check flag
    const checkFlag = check ? "--check" : "--write";
    const filesArg = files.map((f) => nodePath.resolve(cwd, f)).join(" ");

    const cmd = `npx ${formatter} ${checkFlag} ${filesArg} 2>&1`;

    return new Promise((resolve) => {
      const child = exec(cmd, {
        cwd,
        timeout: 15_000,
        maxBuffer: 50_000,
      });

      let output = "";
      child.stdout?.on("data", (chunk: string) => { output += chunk; });

      child.on("close", (code) => {
        const formatted = code === 0;
        const unchanged = output.includes("unchanged") || output.includes("0 file");
        resolve({
          formatter,
          check,
          formatted,
          unchanged: check && unchanged,
          fileCount: files.length,
          output: output.slice(0, 1000),
          hint: check && code !== 0
            ? "Files need formatting. Run format-code without --check to auto-fix."
            : "Formatting complete",
        });
      });

      child.on("error", (err) => {
        resolve({ formatter, error: err.message });
      });
    });
  },
});

async function detectFormatter(): Promise<string> {
  const fs = await import("node:fs/promises");
  try {
    const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["prettier"]) return "prettier";
    if (deps["@biomejs/biome"]) return "@biomejs/biome";
  } catch { /* ignore */ }
  return "prettier"; // Default fallback
}
