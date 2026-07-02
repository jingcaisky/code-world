/**
 * Knowledge Sync — AGENTS.md ↔ SQL + Vector Index + Zvec
 *
 * Synchronizes project knowledge across all stores:
 * 1. AGENTS.md (file)          → SQL Resources (memory)
 * 2. Learnings (SQL Resources) → keep existing
 * 3. Project files             → Local Vector Index (TF-IDF)
 * 4. All the above             → Zvec Vector DB (semantic), if configured
 *
 * Runs at server startup to ensure all knowledge layers
 * are in sync and searchable (keyword + semantic).
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

// ── Types ────────────────────────────────────────────────────────────

interface SyncResult {
  agentsMd: { synced: boolean; size: number; error?: string };
  vectorIndex: { indexed: number; skipped: number; errors: number };
  learnings: { entries: number };
  zvec?: { configured: boolean; totalDocuments: number; errors: number };
  timestamp: number;
}

// ── AGENTS.md → SQL Resources ────────────────────────────────────────

/**
 * Sync AGENTS.md from disk to SQL Resources store.
 * After this, the Agent can read/update AGENTS.md via `resources` tool.
 */
async function syncAgentsMd(): Promise<{ synced: boolean; size: number; error?: string }> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const agentsPath = path.resolve(process.cwd(), "AGENTS.md");

    let content: string;
    try {
      content = await fs.readFile(agentsPath, "utf-8");
    } catch {
      return { synced: false, size: 0, error: "AGENTS.md not found" };
    }

    // Write to SQL Resources (personal scope for now)
    const { resourcePut } = await import("@agent-native/core/resources/store" as any);

    // Use AGENT_USER_EMAIL or a default for local dev
    const ownerEmail =
      process.env.AGENT_USER_EMAIL ?? "local-dev@codeworld.local";

    await resourcePut(ownerEmail, "AGENTS.md", content, "text/markdown");

    return { synced: true, size: content.length };
  } catch (error) {
    console.warn("[knowledge-sync] AGENTS.md sync failed:", error);
    return { synced: false, size: 0, error: String(error) };
  }
}

// ── Auto Vector Index ────────────────────────────────────────────────

/**
 * Auto-index project files into the vector database if empty.
 * Only indexes on first run (when vector_index table is empty).
 * Use AGENT_NATIVE_REINDEX=true to force re-index.
 */
async function syncVectorIndex(): Promise<{
  indexed: number;
  skipped: number;
  errors: number;
}> {
  try {
    const { getEntryCount } = await import("./vector-store");
    const { indexProject } = await import("./content-indexer");

    const existingCount = await getEntryCount();
    const forceReindex = process.env.AGENT_NATIVE_REINDEX === "true";

    // Skip if already indexed and not forced
    if (existingCount > 0 && !forceReindex) {
      console.debug(
        `[knowledge-sync] Vector index already has ${existingCount} entries, skipping. Set AGENT_NATIVE_REINDEX=true to force.`,
      );
      return { indexed: 0, skipped: existingCount, errors: 0 };
    }

    console.log("[knowledge-sync] Indexing project files into vector database...");
    const startTime = Date.now();

    const result = await indexProject(process.cwd(), { maxFiles: 200 });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[knowledge-sync] Vector index complete: ${result.totalFiles} files, ${result.totalChunks} chunks in ${elapsed}s`,
    );

    return {
      indexed: result.totalFiles,
      skipped: 0,
      errors: result.errors,
    };
  } catch (error) {
    console.warn("[knowledge-sync] Vector index sync failed:", error);
    return { indexed: 0, skipped: 0, errors: 1 };
  }
}

// ── Learnings Count ──────────────────────────────────────────────────

async function countLearnings(): Promise<number> {
  try {
    const ownerEmail =
      process.env.AGENT_USER_EMAIL ?? "local-dev@codeworld.local";

    const { resourceGetByPath } = await import(
      "@agent-native/core/resources/store" as any
    );

    const memoryIndex = await resourceGetByPath(ownerEmail, "memory/MEMORY.md")
      .catch(() => null);

    if (!memoryIndex?.content) return 0;

    const lines = memoryIndex.content.split("\n").filter(
      (l: string) => l.startsWith("- ["),
    );
    return lines.length;
  } catch {
    return 0;
  }
}

// ── Main Sync ────────────────────────────────────────────────────────

/**
 * Run all knowledge sync operations at server startup.
 * Fire-and-forget — errors are logged but never crash the server.
 */
export async function syncAllKnowledge(): Promise<SyncResult> {
  console.log("[knowledge-sync] Starting knowledge synchronization...");

  const [agentsMd, vectorIndex, learningsCount] = await Promise.all([
    syncAgentsMd(),
    syncVectorIndex(),
    countLearnings(),
  ]);

  const result: SyncResult = {
    agentsMd,
    vectorIndex,
    learnings: { entries: learningsCount },
    timestamp: Date.now(),
  };

  // Sync to Zvec if configured (fire-and-forget, non-blocking)
  try {
    const { syncAllToZvec } = await import("./knowledge-sync-zvec");
    syncAllToZvec().then((zvecSummary) => {
      if (zvecSummary.configured) {
        result.zvec = {
          configured: true,
          totalDocuments: zvecSummary.totalDocuments,
          errors: zvecSummary.totalErrors,
        };
      }
    }).catch((err) => {
      console.warn("[knowledge-sync] Zvec sync background error:", err);
    });
  } catch {
    // knowledge-sync-zvec not available — fine
  }

  // Log summary
  const parts: string[] = [];
  if (result.agentsMd.synced) {
    parts.push(`AGENTS.md synced (${(result.agentsMd.size / 1024).toFixed(1)}KB)`);
  }
  if (result.vectorIndex.indexed > 0) {
    parts.push(`${result.vectorIndex.indexed} files indexed`);
  }
  if (result.vectorIndex.skipped > 0) {
    parts.push(`${result.vectorIndex.skipped} files already indexed`);
  }
  if (result.learnings.entries > 0) {
    parts.push(`${result.learnings.entries} learnings loaded`);
  }

  console.log(`[knowledge-sync] Complete: ${parts.join(", ") || "no changes"}`);

  return result;
}
