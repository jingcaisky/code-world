/**
 * Zvec Vector Database Client
 *
 * Client for the Zvec vector database — semantic embedding generation,
 * vector CRUD, and similarity search.
 *
 * Two modes:
 * - REMOTE: External Zvec API (AGENT_NATIVE_ZVEC_ENDPOINT)
 * - LOCAL:  Falls back to local TF-IDF via vector-store.ts
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

// ── Configuration ─────────────────────────────────────────────────────

const ZVEC_ENDPOINT = process.env.AGENT_NATIVE_ZVEC_ENDPOINT ?? "";
const ZVEC_API_KEY = process.env.AGENT_NATIVE_ZVEC_API_KEY ?? "";

/** Whether a remote Zvec server is configured */
export const HAS_REMOTE_ZVEC = !!ZVEC_ENDPOINT;

/** Default timeout for Zvec API calls (ms) */
const ZVEC_TIMEOUT_MS = 3000;

// ── Types ────────────────────────────────────────────────────────────

export interface ZvecDocument {
  id: string;
  text: string;
  metadata?: Record<string, string>;
}

export interface ZvecSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, string>;
}

export interface ZvecEmbedding {
  vector: number[];
  dimensions: number;
  model: string;
}

export interface ZvecStatus {
  configured: boolean;
  endpoint: string;
  model: string;
  documentCount: number;
  status: "connected" | "disconnected" | "not_configured";
}

// ── HTTP Helpers ──────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ZVEC_API_KEY) {
    headers["Authorization"] = `Bearer ${ZVEC_API_KEY}`;
  }
  return headers;
}

async function zvecFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T | null> {
  if (!ZVEC_ENDPOINT) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ZVEC_TIMEOUT_MS);

  try {
    const response = await fetch(`${ZVEC_ENDPOINT}${path}`, {
      method: options.method ?? "POST",
      headers: authHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[zvec-client] HTTP ${response.status} on ${path}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn(`[zvec-client] Timeout on ${path}`);
    } else {
      console.warn(`[zvec-client] Error on ${path}:`, error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Embedding API ─────────────────────────────────────────────────────

/**
 * Generate a semantic embedding vector for text.
 * Returns null if Zvec is not configured or unavailable.
 */
export async function generateEmbedding(text: string): Promise<ZvecEmbedding | null> {
  return zvecFetch<ZvecEmbedding>("/api/embed", {
    body: { text: text.slice(0, 8000) },
    timeoutMs: 2000,
  });
}

/**
 * Generate embeddings for multiple texts in one batch.
 */
export async function generateEmbeddings(texts: string[]): Promise<ZvecEmbedding[]> {
  if (!ZVEC_ENDPOINT) return [];

  const result = await zvecFetch<{ embeddings: ZvecEmbedding[] }>("/api/embed/batch", {
    body: { texts: texts.map((t) => t.slice(0, 8000)) },
    timeoutMs: 10000,
  });

  return result?.embeddings ?? [];
}

// ── Vector CRUD ────────────────────────────────────────────────────────

/**
 * Insert or update a document in the Zvec vector database.
 * Provides the text; Zvec handles tokenization and embedding.
 */
export async function upsertDocument(
  id: string,
  text: string,
  metadata: Record<string, string> = {},
): Promise<boolean> {
  const result = await zvecFetch<{ success: boolean }>("/api/documents/upsert", {
    body: { id, text: text.slice(0, 16000), metadata },
  });
  return result?.success ?? false;
}

/**
 * Batch upsert multiple documents.
 */
export async function batchUpsertDocuments(docs: ZvecDocument[]): Promise<number> {
  const result = await zvecFetch<{ inserted: number }>("/api/documents/upsert/batch", {
    body: { documents: docs.map((d) => ({
      id: d.id,
      text: d.text.slice(0, 16000),
      metadata: d.metadata ?? {},
    })) },
    timeoutMs: 15000,
  });
  return result?.inserted ?? 0;
}

/**
 * Delete a document from Zvec.
 */
export async function deleteDocument(id: string): Promise<boolean> {
  const result = await zvecFetch<{ success: boolean }>("/api/documents/delete", {
    body: { id },
  });
  return result?.success ?? false;
}

/**
 * Delete all documents matching a source file prefix.
 */
export async function deleteBySourceFile(sourceFile: string): Promise<number> {
  const result = await zvecFetch<{ deleted: number }>("/api/documents/delete/query", {
    body: { filter: { source_file: sourceFile } },
  });
  return result?.deleted ?? 0;
}

// ── Semantic Search ──────────────────────────────────────────────────

/**
 * Semantic vector search in Zvec.
 * Returns top-K matches sorted by cosine similarity score.
 */
export async function semanticSearch(
  query: string,
  options: {
    topK?: number;
    minScore?: number;
    scope?: string;
  } = {},
): Promise<ZvecSearchResult[]> {
  if (!ZVEC_ENDPOINT) return [];

  const result = await zvecFetch<{ results: ZvecSearchResult[] }>("/api/search", {
    body: {
      query,
      top_k: options.topK ?? 5,
      min_score: options.minScore ?? 0.3,
      ...(options.scope && options.scope !== "all"
        ? { filter: { source_type: options.scope } }
        : {}),
    },
    timeoutMs: 1000,
  });

  return result?.results ?? [];
}

// ── Health Check ──────────────────────────────────────────────────────

/**
 * Check Zvec server status and document count.
 */
export async function checkZvecStatus(): Promise<ZvecStatus> {
  if (!ZVEC_ENDPOINT) {
    return {
      configured: false,
      endpoint: "",
      model: "none",
      documentCount: 0,
      status: "not_configured",
    };
  }

  const result = await zvecFetch<{ model: string; documentCount: number; ok: boolean }>(
    "/api/health",
    { method: "GET", timeoutMs: 3000 },
  );

  return {
    configured: true,
    endpoint: ZVEC_ENDPOINT,
    model: result?.model ?? "unknown",
    documentCount: result?.documentCount ?? 0,
    status: result?.ok ? "connected" : "disconnected",
  };
}

/**
 * Get the best available embedding function.
 * Returns Zvec client if available, otherwise null (use local TF-IDF).
 */
export function getEmbeddingProvider(): "zvec" | "local" {
  return HAS_REMOTE_ZVEC ? "zvec" : "local";
}
