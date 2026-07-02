/**
 * Action: mcp-file-read
 *
 * Precise file content retrieval via MCP (Model Context Protocol).
 * Reads specific files, function signatures, type definitions, and
 * dependency graphs from the project workspace.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 1: Parallel Search
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

// ── Configuration ─────────────────────────────────────────────────────

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 500;

// ── Types ─────────────────────────────────────────────────────────────

interface FileReadResult {
  path: string;
  content: string;
  size_bytes: number;
  language: string | null;
}

interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "import";
  line: number;
  signature?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Guess language from file extension */
function guessLanguage(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    mdx: "mdx",
    css: "css",
    html: "html",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
  };
  return map[ext ?? ""] ?? null;
}

/** Extract function/class signatures from TypeScript/JavaScript content */
function extractSymbols(content: string, filePath: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  const patterns = [
    {
      regex:
        /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/,
      kind: "function" as const,
    },
    {
      regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(([^)]*)\))/,
      kind: "function" as const,
    },
    {
      regex:
        /^(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?/,
      kind: "class" as const,
    },
    {
      regex: /^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[^{]+)?/,
      kind: "interface" as const,
    },
    {
      regex: /^(?:export\s+)?type\s+(\w+)\s*=/,
      kind: "type" as const,
    },
    {
      regex: /^import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/,
      kind: "import" as const,
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const { regex, kind } of patterns) {
      const match = trimmed.match(regex);
      if (match) {
        symbols.push({
          name: kind === "import" ? match[1] : match[1],
          kind,
          line: i + 1,
          signature:
            kind === "function"
              ? `${match[1]}(${match[2]?.trim() ?? ""})`
              : kind === "import"
                ? `from '${match[1]}'`
                : trimmed.slice(0, 80),
        });
      }
    }
  }

  return symbols;
}

// ── Action Definition ─────────────────────────────────────────────────

export default defineAction({
  description: `精确读取项目文件内容、函数签名和类型定义。
通过 MCP 协议读取指定路径的文件，返回完整内容或函数/类签名摘要。
支持 mode 参数控制读取模式：full（完整内容）、signatures（仅函数签名）、deps（依赖关系）。`,

  schema: z.object({
    path: z.string().describe("文件路径（相对于项目根目录）"),
    mode: z
      .enum(["full", "signatures", "deps"])
      .default("full")
      .describe("读取模式：full=完整内容，signatures=仅符号签名，deps=导入依赖"),
    maxLines: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .describe("最大返回行数（仅 full 模式有效）"),
  }),

  http: { method: "GET" },

  run: async ({ path: filePath, mode, maxLines }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      // Use Node.js fs to read the file directly in server context
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const cwd = process.cwd();
      const resolvedPath = path.resolve(cwd, filePath);

      // Security: prevent directory traversal
      if (!resolvedPath.startsWith(cwd)) {
        return {
          error: `Access denied: path "${filePath}" is outside the project directory`,
          path: filePath,
        };
      }

      let content: string;
      try {
        content = await fs.readFile(resolvedPath, "utf-8");
      } catch {
        return {
          error: `File not found: ${filePath}`,
          path: filePath,
        };
      }

      const lines = content.split("\n");
      const language = guessLanguage(filePath);

      // Mode: signatures
      if (mode === "signatures") {
        const symbols = extractSymbols(content, filePath);
        return {
          path: filePath,
          symbols,
          total_symbols: symbols.length,
          language,
          truncated: false,
        };
      }

      // Mode: deps
      if (mode === "deps") {
        const imports = extractSymbols(content, filePath).filter(
          (s) => s.kind === "import",
        );
        return {
          path: filePath,
          imports: imports.map((s) => s.name),
          total_imports: imports.length,
          language,
        };
      }

      // Mode: full — apply line limit
      const limitedLines = maxLines
        ? lines.slice(0, maxLines)
        : lines;

      return {
        path: filePath,
        content: limitedLines.join("\n"),
        size_bytes: Buffer.byteLength(content, "utf-8"),
        total_lines: lines.length,
        returned_lines: limitedLines.length,
        truncated: maxLines ? lines.length > maxLines : false,
        language,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { error: "Timeout", path: filePath, timeout: true };
      }
      console.error("[mcp-file-read] Unexpected error:", error);
      return { error: String(error), path: filePath };
    } finally {
      clearTimeout(timer);
    }
  },
});
