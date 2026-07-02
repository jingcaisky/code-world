/**
 * Knowledge Sync → Zvec Vector Database
 *
 * Auto-synchronizes SQL knowledge (chat_threads, observational_memory,
 * resources/AGENTS.md, learnings) to the Zvec vector database for
 * semantic search capability.
 *
 * Runs at server startup (fire-and-forget) and on sync-knowledge action.
 *
 * Part of: Code World — Hybrid Retrieval Architecture
 */

import {
  HAS_REMOTE_ZVEC,
  batchUpsertDocuments,
  deleteBySourceFile,
  checkZvecStatus,
  type ZvecDocument,
} from "./zvec-client";

// ── Types ────────────────────────────────────────────────────────────

interface ZvecSyncResult {
  synced: boolean;
  documentsInserted: number;
  documentsSkipped: number;
  errors: number;
  latencyMs: number;
}

// ── AGENTS.md → Zvec ──────────────────────────────────────────────────

/**
 * Sync AGENTS.md content to Zvec as semantically searchable document.
 * Splits the large markdown file into section-level chunks.
 */
async function syncAgentsMdToZvec(): Promise<ZvecSyncResult> {
  if (!HAS_REMOTE_ZVEC) {
    return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
  }

  const startTime = Date.now();

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const agentsPath = path.resolve(process.cwd(), "AGENTS.md");

    let content: string;
    try {
      content = await fs.readFile(agentsPath, "utf-8");
    } catch {
      return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
    }

    // Split AGENTS.md by ## sections for chunked indexing
    const sections = content.split(/(?=^## )/m).filter((s) => s.trim());
    if (sections.length === 0) {
      sections.push(content.slice(0, 8000));
    }

    // Delete old AGENTS.md entries
    await deleteBySourceFile("AGENTS.md");

    // Batch insert all sections
    const docs: ZvecDocument[] = sections.map((section, i) => {
      const titleMatch = section.match(/^## (.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : `section-${i}`;
      return {
        id: `agents-md-section-${i}`,
        text: section.slice(0, 16000),
        metadata: {
          source_file: "AGENTS.md",
          source_type: "docs",
          section: title,
          chunk_index: String(i),
        },
      };
    });

    const inserted = await batchUpsertDocuments(docs);

    console.debug(`[zvec-sync] AGENTS.md → Zvec: ${inserted}/${docs.length} sections indexed`);

    return {
      synced: true,
      documentsInserted: inserted,
      documentsSkipped: docs.length - inserted,
      errors: 0,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.warn("[zvec-sync] AGENTS.md → Zvec failed:", error);
    return {
      synced: false,
      documentsInserted: 0,
      documentsSkipped: 0,
      errors: 1,
      latencyMs: Date.now() - startTime,
    };
  }
}

// ── Learnings → Zvec ──────────────────────────────────────────────────

/**
 * Sync user learnings (from SQL Resources) to Zvec.
 * Each learning entry becomes a semantic searchable document.
 */
async function syncLearningsToZvec(): Promise<ZvecSyncResult> {
  if (!HAS_REMOTE_ZVEC) {
    return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
  }

  const startTime = Date.now();

  try {
    const ownerEmail = process.env.AGENT_USER_EMAIL ?? "local-dev@codeworld.local";

    const { resourceGetByPath } = await import(
      "@agent-native/core/resources/store" as any
    );

    const memoryResp = await resourceGetByPath(ownerEmail, "memory/MEMORY.md").catch(() => null);
    if (!memoryResp?.content) {
      return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
    }

    // Parse learnings entries (format: "- [category] content")
    const lines = memoryResp.content.split("\n").filter(
      (l: string) => l.trim().startsWith("- [") || l.trim().startsWith("- "),
    );

    if (lines.length === 0) {
      return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
    }

    // Delete old learnings entries
    await deleteBySourceFile("memory/MEMORY.md");

    // Batch insert
    const docs: ZvecDocument[] = lines.map((line: string, i: number) => {
      const category = line.match(/^-\s*\[(\w+)\]/)?.[1] ?? "general";
      const text = line.replace(/^-\s*\[\w+\]\s*/, "").trim();
      return {
        id: `learning-${i}`,
        text,
        metadata: {
          source_file: "memory/MEMORY.md",
          source_type: "faq",
          category,
          chunk_index: String(i),
        },
      };
    });

    const inserted = await batchUpsertDocuments(docs);

    console.debug(`[zvec-sync] Learnings → Zvec: ${inserted}/${docs.length} entries indexed`);

    return {
      synced: true,
      documentsInserted: inserted,
      documentsSkipped: docs.length - inserted,
      errors: 0,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.warn("[zvec-sync] Learnings → Zvec failed:", error);
    return {
      synced: false,
      documentsInserted: 0,
      documentsSkipped: 0,
      errors: 1,
      latencyMs: Date.now() - startTime,
    };
  }
}

// ── Code Files → Zvec (incremental) ───────────────────────────────────

/**
 * Sync indexed code files from local vector_index to Zvec.
 * Only syncs what's already in the local vector store (no re-scanning of files).
 */
async function syncCodeFilesToZvec(): Promise<ZvecSyncResult> {
  if (!HAS_REMOTE_ZVEC) {
    return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
  }

  const startTime = Date.now();

  try {
    const { getDbExec, isPostgres } = await import("@agent-native/core/db/client");
    const client = getDbExec();

    // Check count in Zvec first
    const zvecStatus = await checkZvecStatus();
    const { getEntryCount } = await import("./vector-store");
    const localCount = await getEntryCount();

    // If Zvec already has roughly the same count, skip
    if (zvecStatus.documentCount >= localCount * 0.9 && localCount > 0) {
      return {
        synced: true,
        documentsInserted: 0,
        documentsSkipped: localCount,
        errors: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // Read entries from local vector_index (limit to first 200 for startup)
    const { rows } = await client.execute({
      sql: `SELECT id, source_file, source_type, chunk_index, content FROM vector_index LIMIT 200`,
      args: [],
    });

    const entries = rows as Array<{
      id: string; source_file: string; source_type: string;
      chunk_index: number; content: string;
    }>;

    if (entries.length === 0) {
      return { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 };
    }

    const docs: ZvecDocument[] = entries.map((e) => ({
      id: e.id,
      text: e.content.slice(0, 16000),
      metadata: {
        source_file: e.source_file,
        source_type: e.source_type,
        chunk_index: String(e.chunk_index),
      },
    }));

    const inserted = await batchUpsertDocuments(docs);

    console.debug(`[zvec-sync] Code files → Zvec: ${inserted}/${docs.length} synced`);

    return {
      synced: true,
      documentsInserted: inserted,
      documentsSkipped: localCount - inserted,
      errors: 0,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    console.warn("[zvec-sync] Code files → Zvec failed:", error);
    return {
      synced: false,
      documentsInserted: 0,
      documentsSkipped: 0,
      errors: 1,
      latencyMs: Date.now() - startTime,
    };
  }
}

// ── Main Sync ────────────────────────────────────────────────────────

export interface ZvecSyncSummary {
  configured: boolean;
  agentsMd: ZvecSyncResult;
  learnings: ZvecSyncResult;
  codeFiles: ZvecSyncResult;
  totalDocuments: number;
  totalErrors: number;
}

/**
 * Sync all SQL knowledge to Zvec vector database.
 * Runs at server startup, fire-and-forget.
 */
export async function syncAllToZvec(): Promise<ZvecSyncSummary> {
  const configured = HAS_REMOTE_ZVEC;

  if (!configured) {
    console.debug("[zvec-sync] Zvec not configured, skipping semantic sync");
    return {
      configured: false,
      agentsMd: { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 },
      learnings: { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 },
      codeFiles: { synced: false, documentsInserted: 0, documentsSkipped: 0, errors: 0, latencyMs: 0 },
      totalDocuments: 0,
      totalErrors: 0,
    };
  }

  console.log("[zvec-sync] Syncing knowledge to Zvec vector database...");

  const [agentsMd, learnings, codeFiles] = await Promise.all([
    syncAgentsMdToZvec(),
    syncLearningsToZvec(),
    syncCodeFilesToZvec(),
  ]);

  const totalDocuments = agentsMd.documentsInserted + learnings.documentsInserted + codeFiles.documentsInserted;
  const totalErrors = agentsMd.errors + learnings.errors + codeFiles.errors;

  console.log(
    `[zvec-sync] Complete: ${totalDocuments} documents synced to Zvec${totalErrors > 0 ? ` (${totalErrors} errors)` : ""}`,
  );

  return {
    configured,
    agentsMd,
    learnings,
    codeFiles,
    totalDocuments,
    totalErrors,
  };
}
