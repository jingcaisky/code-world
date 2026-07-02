/**
 * Content Indexer — File → Chunks → Local Vector Store + Zvec
 *
 * Dual-write pipeline:
 * 1. Read file content + split into chunks
 * 2. Tokenize + compute TF-IDF vectors → local vector_index (SQLite)
 * 3. If Zvec enabled: sync chunks to Zvec vector DB (semantic embedding)
 * 4. Refresh global IDF cache
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

import { tokenize, computeTFIDF, refreshIDFCache } from "./embedder";
import {
  batchUpsertEntries,
  deleteFileEntries,
  getEntryCount,
  type VectorEntry,
} from "./vector-store";
import { HAS_REMOTE_ZVEC, batchUpsertDocuments } from "./zvec-client";

// ── Types ─────────────────────────────────────────────────────────────

export interface IndexOptions {
  /** Source type: code, docs, or faq */
  sourceType?: "code" | "docs" | "faq";
  /** Chunk size in characters (default: 500) */
  chunkSize?: number;
  /** Chunk overlap in characters (default: 100) */
  chunkOverlap?: number;
  /** Files to skip (glob patterns) */
  skipPatterns?: string[];
}

export interface IndexResult {
  file: string;
  chunks: number;
  success: boolean;
  error?: string;
}

/** Files that should never be indexed */
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".ico", ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".mov", ".avi",
  ".db", ".sqlite", ".sqlite3",
  ".lock", ".map", ".d.ts",
  ".zip", ".tar", ".gz", ".7z",
  ".min.js", ".min.css",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".generated",
  "build", ".next", ".turbo", ".cache",
  "__pycache__", ".venv", "coverage",
]);

// ── Chunking ──────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks, respecting sentence boundaries.
 * For code files, chunks are based on top-level definitions (functions/classes).
 */
export function chunkContent(
  content: string,
  filePath: string,
  options: { chunkSize?: number; chunkOverlap?: number } = {},
): string[] {
  const chunkSize = options.chunkSize ?? 500;
  const chunkOverlap = options.chunkOverlap ?? 100;

  // Code files: split by top-level definitions
  if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return chunkCodeFile(content, chunkSize);
  }

  // Text files: split by paragraphs/sentences
  return chunkTextFile(content, chunkSize, chunkOverlap);
}

/**
 * Chunk code by top-level definitions (export/function/class/interface).
 */
function chunkCodeFile(content: string, maxSize: number): string[] {
  const lines = content.split("\n");
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Start a new chunk at top-level definitions
    const isTopLevelDef =
      /^(export\s+)?(async\s+)?function\s+\w+/.test(trimmed) ||
      /^(export\s+)?class\s+\w+/.test(trimmed) ||
      /^(export\s+)?interface\s+\w+/.test(trimmed) ||
      /^(export\s+)?type\s+\w+\s*=/.test(trimmed) ||
      /^(export\s+)?const\s+\w+/.test(trimmed);

    if (isTopLevelDef && currentSize > maxSize * 0.5) {
      // Flush current chunk
      chunks.push(currentChunk.join("\n"));
      currentChunk = [line];
      currentSize = line.length;
    } else {
      currentChunk.push(line);
      currentSize += line.length + 1; // +1 for newline
    }

    // Force flush if chunk exceeds max size
    if (currentSize > maxSize && currentChunk.length > 1) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [];
      currentSize = 0;
    }
  }

  // Flush remaining
  if (currentChunk.length > 0) {
    const remaining = currentChunk.join("\n");
    if (remaining.trim()) {
      chunks.push(remaining);
    }
  }

  return chunks;
}

/**
 * Chunk text by paragraph boundaries with overlap.
 */
function chunkTextFile(
  content: string,
  maxSize: number,
  overlap: number,
): string[] {
  // Split by double newlines (paragraphs)
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());
  const chunks: string[] = [];

  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      // Keep overlap from the end of previous chunk
      current = current.slice(-overlap) + "\n\n" + paragraph;
    } else {
      current += (current ? "\n\n" : "") + paragraph;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [content.slice(0, maxSize)];
}

// ── File Scanner ──────────────────────────────────────────────────────

/**
 * Scan a directory for indexable files.
 */
export async function scanFiles(
  rootDir: string,
  options: { maxFiles?: number } = {},
): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const files: string[] = [];
  const maxFiles = options.maxFiles ?? 200;

  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;

    let entries: string[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;

        // Only index known text/code formats
        const indexable = [
          ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mdx",
          ".css", ".html", ".yaml", ".yml", ".toml", ".sql", ".sh",
          ".py", ".rs", ".go", ".java", ".rb", ".php",
        ];
        if (indexable.includes(ext)) {
          files.push(relativePath);
        }
      }
    }
  }

  await walk(rootDir);
  return files.slice(0, maxFiles);
}

// ── File Indexer ──────────────────────────────────────────────────────

/**
 * Index a single file into the vector store.
 */
export async function indexFile(
  filePath: string,
  rootDir: string = process.cwd(),
  options: IndexOptions = {},
): Promise<IndexResult> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const fullPath = path.resolve(rootDir, filePath);

  try {
    // Check if file exists
    await fs.access(fullPath);
  } catch {
    return { file: filePath, chunks: 0, success: false, error: "File not found" };
  }

  // Guess source type from path
  let sourceType: "code" | "docs" | "faq" = options.sourceType ?? "code";
  if (!options.sourceType) {
    if (filePath.includes("docs/") || filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
      sourceType = "docs";
    } else if (filePath.includes("faq") || filePath.includes("FAQ")) {
      sourceType = "faq";
    }
  }

  try {
    // Read file content
    const content = await fs.readFile(fullPath, "utf-8");
    if (!content.trim()) {
      return { file: filePath, chunks: 0, success: true };
    }

    // Delete existing entries for this file
    await deleteFileEntries(filePath);

    // Chunk content
    const chunks = chunkContent(content, fullPath, {
      chunkSize: options.chunkSize,
      chunkOverlap: options.chunkOverlap,
    });

    // Build entries
    const entries: Omit<VectorEntry, "id">[] = chunks.map((chunk, index) => ({
      sourceFile: filePath,
      sourceType,
      chunkIndex: index,
      content: chunk,
      tokens: computeTFIDF(tokenize(chunk)),
    }));

    // Batch insert to local vector store
    await batchUpsertEntries(entries);

    // Dual-write to Zvec if available (fire-and-forget, don't block)
    if (HAS_REMOTE_ZVEC) {
      batchUpsertDocuments(
        entries.map((e) => ({
          id: `idx:${filePath}:${e.chunkIndex}`,
          text: e.content.slice(0, 16000),
          metadata: {
            source_file: e.sourceFile,
            source_type: e.sourceType,
            chunk_index: String(e.chunkIndex),
          },
        })),
      ).catch((err) => {
        console.warn(`[content-indexer] Zvec sync failed for ${filePath}:`, err);
      });
    }

    // Refresh global IDF cache after indexing
    await refreshIDFCache();

    return { file: filePath, chunks: entries.length, success: true };
  } catch (error) {
    return {
      file: filePath,
      chunks: 0,
      success: false,
      error: String(error),
    };
  }
}

/**
 * Index multiple files. Returns a summary of results.
 */
export async function indexFiles(
  files: string[],
  rootDir: string = process.cwd(),
  options: IndexOptions = {},
): Promise<{ results: IndexResult[]; totalChunks: number; errors: number }> {
  const results: IndexResult[] = [];
  let totalChunks = 0;
  let errors = 0;

  for (const file of files) {
    const result = await indexFile(file, rootDir, options);
    results.push(result);
    if (result.success) {
      totalChunks += result.chunks;
    } else {
      errors++;
    }
  }

  // Final IDF cache refresh
  await refreshIDFCache();

  return { results, totalChunks, errors };
}

/**
 * Index all project files (quick bootstrap).
 * Scans the project root, indexes all code and doc files.
 */
export async function indexProject(
  rootDir: string = process.cwd(),
  options: IndexOptions & { maxFiles?: number } = {},
): Promise<{ totalFiles: number; totalChunks: number; errors: number; preExisting: number }> {
  const preExisting = await getEntryCount();

  // Scan project files
  const files = await scanFiles(rootDir, { maxFiles: options.maxFiles });

  // Index them
  const { totalChunks, errors } = await indexFiles(files, rootDir, options);

  return {
    totalFiles: files.length,
    totalChunks,
    errors,
    preExisting,
  };
}
