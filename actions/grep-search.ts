/**
 * Action: grep-search
 * Fast regex/code search across project files.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `在项目文件中按关键词或正则表达式搜索代码内容。
比 zvec-search 更快、更精确（精确匹配而非语义近似），适合搜索函数名、变量名、导入语句等。`,
  schema: z.object({
    pattern: z.string().describe("搜索模式（支持正则表达式）"),
    path: z.string().optional().default(".").describe("搜索目录（默认项目根目录）"),
    glob: z.string().optional().describe("文件过滤（如 '*.ts'、'*.tsx'）"),
    maxResults: z.number().optional().default(30),
    caseSensitive: z.boolean().optional().default(false),
    contextLines: z.number().optional().default(0).describe("匹配行的上下文行数"),
  }),
  http: { method: "GET" },
  run: async ({ pattern, path: searchPath, glob, maxResults, caseSensitive, contextLines }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const cwd = process.cwd();
    const root = nodePath.resolve(cwd, searchPath ?? ".");
    if (!root.startsWith(cwd)) return { error: "Access denied" };

    const results: Array<{ file: string; line: number; text: string; context?: string[] }> = [];
    const flags = caseSensitive ? "g" : "gi";
    let regex: RegExp;
    try { regex = new RegExp(pattern, flags); } catch {
      return { error: "Invalid regex pattern" };
    }

    async function walk(dir: string) {
      if (results.length >= (maxResults ?? 30)) return;
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (results.length >= (maxResults ?? 30)) break;
        const full = nodePath.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name.startsWith(".") || ["node_modules", "dist", ".git", ".generated"].includes(e.name)) continue;
          await walk(full);
        } else if (e.isFile()) {
          if (glob && !minimatch(e.name, glob)) continue;
          try {
            const content = await fs.readFile(full, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && results.length < (maxResults ?? 30); i++) {
              if (regex.test(lines[i])) {
                regex.lastIndex = 0;
                const rel = nodePath.relative(cwd, full);
                const ctx = contextLines ? lines.slice(Math.max(0, i - contextLines), i + contextLines + 1) : undefined;
                results.push({ file: rel, line: i + 1, text: lines[i].slice(0, 200), context: ctx });
              }
            }
          } catch { /* skip unreadable */ }
        }
      }
    }

    await walk(root);
    return { pattern, results, total: results.length, truncated: results.length >= (maxResults ?? 30) };
  },
});

function minimatch(filename: string, glob: string): boolean {
  const re = new RegExp("^" + glob.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
  return re.test(filename);
}
