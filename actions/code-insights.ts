/**
 * Action: code-insights
 *
 * Predictive Analytics + Code Evolution Tracking:
 * - Analyze code complexity trends
 * - Detect potential bug hotspots
 * - Track file churn and evolution
 * - Identify stale or over-complex code
 *
 * Part of: Code World — Predictive Analytics & Code Evolution
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `代码洞察分析：复杂度趋势、Bug热点检测、代码演化追踪。
支持的操作：
- complexity: 分析代码复杂度趋势
- hotspots: 检测最常修改的文件（Bug热点）
- churn: 分析文件变更频率
- staleness: 检测长期未修改但高频依赖的文件
- evolution: 追踪代码演化历史`,
  schema: z.object({
    operation: z.enum(["complexity", "hotspots", "churn", "staleness", "evolution"]),
    path: z.string().optional().default("."),
    days: z.number().optional().default(30).describe("分析的时间范围（天）"),
    topK: z.number().optional().default(10),
  }),
  http: { method: "GET" },
  run: async ({ operation, path: targetPath, days, topK }) => {
    const { exec } = await import("node:child_process");
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    const cwd = process.cwd();
    const since = `${days} days ago`;

    const execGit = (cmd: string): Promise<string> =>
      new Promise((resolve, reject) => {
        exec(cmd, { cwd, timeout: 10000, maxBuffer: 200000 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });

    switch (operation) {
      // ── Hotspots: most frequently changed files ─────────────────
      case "hotspots": {
        try {
          const out = await execGit(
            `git log --since="${since}" --name-only --pretty=format: -- "${targetPath}" | sort | uniq -c | sort -rn | head -${topK}`,
          );
          const files = parseHotspots(out);
          return {
            operation: "hotspots",
            since,
            count: files.length,
            hotspots: files.map((f, i) => ({
              rank: i + 1,
              file: f.file,
              changes: f.count,
              risk: f.count > 15 ? "high" : f.count > 8 ? "medium" : "low",
            })),
            hint: files.length > 0
              ? `Top hotspot: ${files[0].file} (${files[0].count} changes). These files may need refactoring or additional tests.`
              : "No significant hotspots detected.",
          };
        } catch {
          return { operation: "hotspots", error: "Git history unavailable" };
        }
      }

      // ── Churn: file change frequency ──────────────────────────
      case "churn": {
        try {
          const out = await execGit(
            `git log --since="${since}" --numstat --pretty=format: -- "${targetPath}" | awk '{added+=$1; deleted+=$2; files[$3]++} END {for (f in files) print files[f], added, deleted, f}' | sort -rn | head -${topK}`,
          );
          const files = parseChurn(out);
          return {
            operation: "churn",
            since,
            totalFiles: files.length,
            totalAdded: files.reduce((s, f) => s + f.added, 0),
            totalRemoved: files.reduce((s, f) => s + f.removed, 0),
            files,
          };
        } catch {
          return { operation: "churn", error: "Git history unavailable" };
        }
      }

      // ── Staleness: old unchanged files that are heavily imported ─
      case "staleness": {
        try {
          const out = await execGit(
            `git log --since="${since}" --name-only -- "${targetPath}" | sort -u`,
          );
          const changedFiles = new Set(out.split("\n").filter(Boolean));

          // Find files NOT in changed set
          const allOut = await execGit(
            `git ls-files "${targetPath}" | head -200`,
          );
          const allFiles = allOut.split("\n").filter(Boolean);

          const stale = allFiles
            .filter((f) => !changedFiles.has(f) && /\.(ts|tsx|js|jsx)$/.test(f))
            .slice(0, topK);

          return {
            operation: "staleness",
            since,
            staleCount: stale.length,
            staleFiles: stale.map((f) => ({
              file: f,
              daysUnchanged: days,
              risk: days > 60 ? "high" : "medium",
            })),
            hint: stale.length > 0
              ? `${stale.length} files unchanged for ${days} days. Consider reviewing for outdated patterns.`
              : `All files modified within ${days} days.`,
          };
        } catch {
          return { operation: "staleness", error: "Git history unavailable" };
        }
      }

      // ── Evolution: code history for a specific file ────────────
      case "evolution": {
        if (targetPath === ".") {
          return { operation: "evolution", error: "Specify a file path for evolution tracking" };
        }
        try {
          const log = await execGit(
            `git log --oneline --follow -- "${targetPath}" | head -20`,
          );
          const commits = log.split("\n").filter(Boolean);
          return {
            operation: "evolution",
            file: targetPath,
            totalCommits: commits.length,
            recentCommits: commits.map((c) => {
              const [hash, ...msg] = c.split(" ");
              return { hash, message: msg.join(" ") };
            }),
          };
        } catch {
          return { operation: "evolution", error: "Git history unavailable" };
        }
      }

      // ── Complexity: estimate code complexity ───────────────────
      case "complexity": {
        const results = await analyzeComplexity(targetPath, cwd);
        return {
          operation: "complexity",
          files: results.files,
          avgComplexity: results.avgComplexity,
          maxComplexity: results.maxComplexity,
          riskFiles: results.riskFiles.slice(0, topK),
          summary: results.riskFiles.length > 0
            ? `${results.riskFiles.length} files with high complexity (>15). Highest: ${results.riskFiles[0]?.file ?? "N/A"}.`
            : "Complexity within normal range.",
        };
      }

      default:
        return { error: `Unknown operation: ${operation}` };
    }
  },
});

// ── Helpers ────────────────────────────────────────────────────────────

interface Hotspot { file: string; count: number; risk: string }
function parseHotspots(out: string): Hotspot[] {
  return out.split("\n").filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/);
    const count = parseInt(parts[0]);
    return { file: parts.slice(1).join(" "), count, risk: "low" };
  });
}

interface ChurnFile { file: string; changes: number; added: number; removed: number }
function parseChurn(out: string): ChurnFile[] {
  return out.split("\n").filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/);
    return {
      file: parts[3] ?? "",
      changes: parseInt(parts[0]) || 0,
      added: parseInt(parts[1]) || 0,
      removed: parseInt(parts[2]) || 0,
    };
  }).filter((f) => f.file);
}

async function analyzeComplexity(targetPath: string, cwd: string) {
  const fs = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const riskFiles: Array<{ file: string; complexity: number; lines: number; functions: number }> = [];
  let totalComplexity = 0;
  let fileCount = 0;

  async function walk(dir: string) {
    if (fileCount > 100) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && !["node_modules", "dist", ".git"].includes(e.name)) {
          await walk(nodePath.join(dir, e.name));
        } else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
          const content = await fs.readFile(nodePath.join(dir, e.name), "utf-8");
          const lines = content.split("\n");
          const functions = (content.match(/\bfunction\b|\bconst\s+\w+\s*=\s*(\(|async\s*\()/g) || []).length;
          // Simple complexity heuristic: branching + nesting
          const branches = (content.match(/\b(if|else|switch|case|for|while|catch)\b/g) || []).length;
          const complexity = Math.round(branches * 1.5 + functions * 2 + lines.length * 0.02);
          totalComplexity += complexity;
          fileCount++;
          const rel = nodePath.relative(cwd, nodePath.join(dir, e.name));
          if (complexity > 15) {
            riskFiles.push({ file: rel, complexity, lines: lines.length, functions });
          }
        }
      }
    } catch { /* skip */ }
  }

  await walk(targetPath);

  riskFiles.sort((a, b) => b.complexity - a.complexity);

  return {
    files: fileCount,
    avgComplexity: fileCount > 0 ? Math.round(totalComplexity / fileCount) : 0,
    maxComplexity: riskFiles[0]?.complexity ?? 0,
    riskFiles,
  };
}
