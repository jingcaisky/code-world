/**
 * Embedder — Local TF-IDF + Zvec Semantic Embedding
 *
 * Two-tier embedding system:
 * 1. TF-IDF (local): Fast token-frequency vectors, zero deps
 * 2. Zvec (remote): Dense semantic embeddings, when ZVEC_ENDPOINT is configured
 *
 * For hybrid search, both tiers are used together (Pre-L0 → RRF fusion).
 * When Zvec is unavailable, falls back to TF-IDF-only.
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

// ── Tokenizer ─────────────────────────────────────────────────────────

/**
 * Common code-specific stop words to exclude from tokenization.
 * Extended with programming language keywords and common patterns.
 */
const STOP_WORDS = new Set([
  // English
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "here", "there",
  "when", "where", "why", "how", "all", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "and", "but", "or", "if",
  "this", "that", "these", "those", "it", "its", "they", "them",
  "their", "he", "she", "him", "her", "his", "we", "us", "our",
  "you", "your", "me", "my", "myself", "i",

  // Programming
  "const", "let", "var", "function", "return", "export", "import",
  "default", "from", "typeof", "instanceof", "new", "delete",
  "void", "null", "undefined", "true", "false", "this", "super",
  "class", "extends", "implements", "interface", "type", "enum",
  "async", "await", "yield", "try", "catch", "finally", "throw",
  "if", "else", "switch", "case", "break", "continue", "for",
  "while", "do", "in", "of",

  // Common code symbols (kept as token but down-weighted)
  "props", "args", "params", "data", "result", "value", "item",
  "index", "key", "ref", "state", "setstate", "usestate", "useeffect",
]);

/** Minimum token length to be considered meaningful */
const MIN_TOKEN_LENGTH = 2;

/** Maximum token length to avoid UUIDs and hashes */
const MAX_TOKEN_LENGTH = 40;

/**
 * Tokenize text into a normalized token array.
 * Splits on word boundaries, lowercases, filters stop words.
 */
export function tokenize(text: string): string[] {
  // Split on word boundaries: camelCase, PascalCase, snake_case, kebab-case
  const words = text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ACRONYMWord → ACRONYM Word
    .replace(/[-_.]/g, " ") // kebab-case, snake_case → space
    .replace(/[^a-zA-Z0-9\s]/g, " ") // Remove non-alphanumeric
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  // Filter by length, stop words, and digit-only
  return words.filter(
    (w) =>
      w.length >= MIN_TOKEN_LENGTH &&
      w.length <= MAX_TOKEN_LENGTH &&
      !STOP_WORDS.has(w) &&
      !/^\d+$/.test(w), // Not pure digits
  );
}

/**
 * Compute term frequency for a token array.
 * TF(t) = count(t) / total tokens
 */
export function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const total = tokens.length;
  if (total === 0) return tf;

  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  // Normalize
  for (const [token, count] of tf) {
    tf.set(token, count / total);
  }

  return tf;
}

/**
 * Global document frequency cache.
 * IDF(t) = log(N / df(t)) where N = total documents, df(t) = docs containing token.
 */
let idfCache: Map<string, number> | null = null;
let idfDocumentCount = 0;

/**
 * Compute IDF from a list of tokenized documents.
 * Call this after indexing to update the global IDF cache.
 */
export function computeIDF(allDocuments: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  const N = allDocuments.length;
  idfDocumentCount = N;

  for (const doc of allDocuments) {
    const uniqueTokens = new Set(doc);
    for (const token of uniqueTokens) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, count] of df) {
    idf.set(token, Math.log((N + 1) / (count + 1)) + 1); // Smooth IDF
  }

  idfCache = idf;
  return idf;
}

/**
 * Compute TF-IDF weights for a token array.
 * Requires IDF cache to be populated first (call computeIDF after indexing).
 */
export function computeTFIDF(tokens: string[]): Map<string, number> {
  const tf = computeTF(tokens);
  const tfidf = new Map<string, number>();

  for (const [token, tfValue] of tf) {
    const idfValue = idfCache?.get(token) ?? 1.0; // Default IDF = 1 if not in cache
    tfidf.set(token, tfValue * idfValue);
  }

  return tfidf;
}

/**
 * Refresh IDF cache by loading all indexed documents.
 * Call this after batch indexing new content.
 */
export async function refreshIDFCache(): Promise<void> {
  try {
    const { loadCandidates } = await import("./vector-store");

    // Load all entries to rebuild IDF
    // We use a direct DB query instead of the public API
    const { getDbExec } = await import("@agent-native/core/db/client");
    const client = getDbExec();
    const { rows } = await client.execute({
      sql: `SELECT content FROM vector_index`,
      args: [],
    });

    const allDocs = (rows as Record<string, unknown>[])
      .map((r) => tokenize(String(r.content ?? "")))
      .filter((tokens) => tokens.length > 0);

    if (allDocs.length > 0) {
      computeIDF(allDocs);
    }
  } catch {
    // Table may not exist yet — that's fine
  }
}

/** Get current IDF cache stats */
export function getIDFStats(): { documentCount: number; tokenCount: number } {
  return {
    documentCount: idfDocumentCount,
    tokenCount: idfCache?.size ?? 0,
  };
}

// ── Semantic Embedding (Zvec) ──────────────────────────────────────────

export interface SemanticEmbedding {
  vector: number[];
  dimensions: number;
  /** "zvec" | "local" | "unavailable" */
  provider: string;
}

let _zvecAvailable: boolean | null = null;

/**
 * Generate a semantic embedding vector via Zvec API.
 * Falls back to TF-IDF sparse vector if Zvec is unavailable.
 */
export async function generateSemanticEmbedding(text: string): Promise<SemanticEmbedding> {
  // Check Zvec availability (cached)
  if (_zvecAvailable === null) {
    try {
      const { HAS_REMOTE_ZVEC } = await import("./zvec-client");
      _zvecAvailable = HAS_REMOTE_ZVEC;
    } catch {
      _zvecAvailable = false;
    }
  }

  if (_zvecAvailable) {
    try {
      const { generateEmbedding } = await import("./zvec-client");
      const result = await generateEmbedding(text);
      if (result) {
        return {
          vector: result.vector,
          dimensions: result.dimensions,
          provider: "zvec",
        };
      }
    } catch { /* fall through */ }
  }

  // Fallback: TF-IDF sparse vector (token → weight map as dense vector)
  const tokens = tokenize(text);
  const tfidf = computeTFIDF(tokens);
  const vector = Array.from(tfidf.values());

  return {
    vector,
    dimensions: vector.length,
    provider: "local",
  };
}

/**
 * Get the current embedding provider name.
 */
export function getEmbeddingProvider(): string {
  return _zvecAvailable ? "zvec" : "local";
}
