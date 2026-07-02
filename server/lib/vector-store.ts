/**
 * Vector Store — SQLite-backed
 *
 * Lightweight vector storage using SQLite for similarity search.
 * Stores TF-IDF weighted tokens as JSON arrays, computes cosine
 * similarity in JavaScript for the "top K" query.
 *
 * Zero external dependencies — works with the project's existing SQLite.
 * Upgradeable path: swap to pgvector / Qdrant / Pinecone later.
 *
 * Part of: Integration Plan Phase 1.1
 */

import { getDbExec, isPostgres } from "@agent-native/core/db/client";
import { ensureTableExists } from "@agent-native/core/db/ddl-guard";

// ── Table Schema ───────────────────────────────────────────────────────

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;

  tableReady = (async () => {
    const client = getDbExec();
    const intType = isPostgres() ? "BIGINT" : "INTEGER";
    const textType = isPostgres() ? "TEXT" : "TEXT";

    const createSql = `CREATE TABLE IF NOT EXISTS vector_index (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'code',
      chunk_index ${intType} NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      tokens TEXT NOT NULL,
      token_count ${intType} NOT NULL DEFAULT 0,
      created_at ${intType} NOT NULL,
      updated_at ${intType} NOT NULL
    )`;

    if (isPostgres()) {
      await ensureTableExists("vector_index", createSql);
    } else {
      await client.execute(createSql);
    }

    // Index for source file filter
    try {
      await client.execute(
        `CREATE INDEX IF NOT EXISTS vector_index_source_file_idx ON vector_index(source_file)`,
      );
    } catch { /* Index exists */ }

    // Index for source type filter
    try {
      await client.execute(
        `CREATE INDEX IF NOT EXISTS vector_index_source_type_idx ON vector_index(source_type)`,
      );
    } catch { /* Index exists */ }
  })().catch((err) => {
    tableReady = null;
    throw err;
  });

  return tableReady;
}

// ── Types ─────────────────────────────────────────────────────────────

export interface VectorEntry {
  id: string;
  sourceFile: string;
  sourceType: "code" | "docs" | "faq";
  chunkIndex: number;
  content: string;
  tokens: Map<string, number>; // token → TF-IDF weight
}

export interface SearchResult {
  entry: VectorEntry;
  score: number; // cosine similarity, 0-1
}

// ── CRUD Operations ───────────────────────────────────────────────────

function entryId(sourceFile: string, chunkIndex: number): string {
  return `${sourceFile}#chunk${chunkIndex}`;
}

function serializeTokens(tokens: Map<string, number>): string {
  return JSON.stringify([...tokens.entries()]);
}

function deserializeTokens(raw: string): Map<string, number> {
  try {
    return new Map(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

function rowToEntry(row: Record<string, unknown>): VectorEntry {
  return {
    id: String(row.id),
    sourceFile: String(row.source_file),
    sourceType: (row.source_type as VectorEntry["sourceType"]) ?? "code",
    chunkIndex: Number(row.chunk_index) || 0,
    content: String(row.content),
    tokens: deserializeTokens(String(row.tokens)),
  };
}

/** Insert or replace a vector entry */
export async function upsertEntry(entry: Omit<VectorEntry, "id">): Promise<VectorEntry> {
  await ensureTable();
  const client = getDbExec();
  const id = entryId(entry.sourceFile, entry.chunkIndex);
  const now = Date.now();

  const full: VectorEntry = { ...entry, id };

  await client.execute({
    sql: `INSERT OR REPLACE INTO vector_index
      (id, source_file, source_type, chunk_index, content, tokens, token_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      entry.sourceFile,
      entry.sourceType,
      entry.chunkIndex,
      entry.content.slice(0, 4000), // Cap content length
      serializeTokens(entry.tokens),
      entry.tokens.size,
      now,
      now,
    ],
  });

  return full;
}

/** Batch insert entries from a chunked file */
export async function batchUpsertEntries(
  entries: Omit<VectorEntry, "id">[],
): Promise<number> {
  await ensureTable();
  let count = 0;

  for (const entry of entries) {
    await upsertEntry(entry);
    count++;
  }

  return count;
}

/** Delete all entries for a source file */
export async function deleteFileEntries(sourceFile: string): Promise<number> {
  await ensureTable();
  const client = getDbExec();
  const result = await client.execute({
    sql: `DELETE FROM vector_index WHERE source_file = ?`,
    args: [sourceFile],
  });
  return result.rowsAffected ?? 0;
}

/** Get all entries for a source file */
export async function getFileEntries(sourceFile: string): Promise<VectorEntry[]> {
  await ensureTable();
  const client = getDbExec();
  const { rows } = await client.execute({
    sql: `SELECT * FROM vector_index WHERE source_file = ? ORDER BY chunk_index ASC`,
    args: [sourceFile],
  });
  return (rows as Record<string, unknown>[]).map(rowToEntry);
}

/** Get total entry count */
export async function getEntryCount(): Promise<number> {
  await ensureTable();
  const client = getDbExec();
  const { rows } = await client.execute({
    sql: `SELECT COUNT(*) as count FROM vector_index`,
    args: [],
  });
  return Number((rows[0] as any)?.count) || 0;
}

// ── Search ─────────────────────────────────────────────────────────────

/**
 * Load all entries matching the given source type filter.
 */
async function loadCandidates(
  sourceType?: "code" | "docs" | "faq" | "all",
): Promise<VectorEntry[]> {
  await ensureTable();
  const client = getDbExec();

  if (!sourceType || sourceType === "all") {
    const { rows } = await client.execute({
      sql: `SELECT * FROM vector_index ORDER BY chunk_index ASC`,
      args: [],
    });
    return (rows as Record<string, unknown>[]).map(rowToEntry);
  }

  const { rows } = await client.execute({
    sql: `SELECT * FROM vector_index WHERE source_type = ? ORDER BY chunk_index ASC`,
    args: [sourceType],
  });
  return (rows as Record<string, unknown>[]).map(rowToEntry);
}

/**
 * Compute cosine similarity between two token maps.
 * Both maps should use the same token space (TF-IDF weighted).
 */
export function cosineSimilarity(
  queryTokens: Map<string, number>,
  entryTokens: Map<string, number>,
): number {
  // Union of all tokens
  const allTokens = new Set([
    ...queryTokens.keys(),
    ...entryTokens.keys(),
  ]);

  let dotProduct = 0;
  let queryMag = 0;
  let entryMag = 0;

  for (const token of allTokens) {
    const q = queryTokens.get(token) ?? 0;
    const e = entryTokens.get(token) ?? 0;
    dotProduct += q * e;
    queryMag += q * q;
    entryMag += e * e;
  }

  if (queryMag === 0 || entryMag === 0) return 0;

  return dotProduct / (Math.sqrt(queryMag) * Math.sqrt(entryMag));
}

/**
 * Search the vector index for entries most similar to the query.
 * Returns topK results sorted by cosine similarity descending.
 */
export async function searchVectorIndex(
  query: string,
  options: {
    topK?: number;
    minScore?: number;
    scope?: "code" | "docs" | "faq" | "all";
  } = {},
): Promise<SearchResult[]> {
  const { topK = 5, minScore = 0.1, scope = "all" } = options;

  // Import embedder lazily to avoid circular dependency
  const { tokenize, computeTFIDF } = await import("./embedder");

  const queryTokens = tokenize(query);
  const queryVector = computeTFIDF(queryTokens);

  // Load candidates filtered by scope
  const candidates = await loadCandidates(scope);

  // Score each candidate
  const scored: SearchResult[] = candidates.map((entry) => ({
    entry,
    score: cosineSimilarity(queryVector, entry.tokens),
  }));

  // Filter by min score, sort descending, take top K
  return scored
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Quick check: do we have any indexed content?
 */
export async function hasIndexedContent(): Promise<boolean> {
  const count = await getEntryCount();
  return count > 0;
}
