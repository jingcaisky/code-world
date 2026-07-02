/**
 * Change Reporter — Layer 4
 *
 * Generates a comprehensive change report after plan execution.
 * Collects all file changes, review results, and produces a
 * user-facing summary card + commit message.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 4
 */

import type { SubAgentOutput } from "./sub-agent-runner";
import type { ReviewResult } from "./review-checker";
import type { PlanManifest } from "./plan-engine";

// ── Types ─────────────────────────────────────────────────────────────

export interface FileChange {
  path: string;
  status: "created" | "modified" | "deleted";
  added: number;
  removed: number;
  language: string | null;
}

export interface ChangeReport {
  /** Plan this report belongs to */
  planId: string;
  /** Overall task summary */
  taskSummary: string;
  /** Created files */
  createdFiles: string[];
  /** Modified files with diff stats */
  modifiedFiles: FileChange[];
  /** Deleted files */
  deletedFiles: string[];
  /** Review summary */
  review: {
    critical: number;
    warning: number;
    suggestion: number;
    autoFixed: number;
    hasCritical: boolean;
    summary: string;
  };
  /** Total lines changed */
  totalAdded: number;
  totalRemoved: number;
  /** Sub-agent execution summary */
  agentOutputs: Array<{
    agent: string;
    success: boolean;
    summary: string;
  }>;
  /** Estimated impact */
  estimatedImpact: string;
  /** Auto-generated commit message */
  commitMessage: string;
  /** Timestamp */
  generatedAt: number;
}

// ── File Change Collector ────────────────────────────────────────────

/**
 * Collect and normalize file changes from sub-agent outputs.
 */
export function collectFileChanges(
  outputs: SubAgentOutput[],
): { created: string[]; modified: FileChange[]; deleted: string[] } {
  const created = new Set<string>();
  const modified: FileChange[] = [];
  const deleted = new Set<string>();

  for (const output of outputs) {
    if (!output.success) continue;

    if (output.filesCreated) {
      for (const f of output.filesCreated) {
        created.add(f);
      }
    }

    if (output.filesModified) {
      for (const m of output.filesModified) {
        // Deduplicate by merging changes to the same file
        const existing = modified.find((fm) => fm.path === m.path);
        if (existing) {
          existing.added += m.added;
          existing.removed += m.removed;
        } else {
          modified.push({
            path: m.path,
            status: "modified",
            added: m.added,
            removed: m.removed,
            language: guessFileLanguage(m.path),
          });
        }
      }
    }
  }

  return {
    created: [...created],
    modified,
    deleted: [...deleted],
  };
}

// ── Language Inference ────────────────────────────────────────────────

function guessFileLanguage(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    css: "CSS",
    json: "JSON",
    md: "Markdown",
    mdx: "MDX",
    sql: "SQL",
    yaml: "YAML",
    toml: "TOML",
    html: "HTML",
  };
  return map[ext ?? ""] ?? null;
}

// ── Impact Estimator ──────────────────────────────────────────────────

function estimateImpact(
  createdCount: number,
  modifiedCount: number,
  totalAdded: number,
  totalRemoved: number,
  review: { critical: number; warning: number },
): string {
  const totalFiles = createdCount + modifiedCount;
  const totalChanges = totalAdded + totalRemoved;

  if (review.critical > 0) {
    return `⚠️ ${totalFiles} files changed (+${totalChanges} lines). ${review.critical} critical issues require attention.`;
  }

  if (totalFiles <= 1 && totalChanges < 50) {
    return `🟢 Small change: ${totalFiles} file, +${totalAdded}/-${totalRemoved} lines.`;
  }

  if (totalFiles <= 3 && totalChanges < 200) {
    return `🟡 Medium change: ${totalFiles} files, +${totalAdded}/-${totalRemoved} lines.`;
  }

  return `🔴 Large change: ${totalFiles} files, +${totalAdded}/-${totalRemoved} lines. Review carefully.`;
}

// ── Commit Message Generator ──────────────────────────────────────────

function generateCommitMessage(
  plan: PlanManifest,
  created: string[],
  modified: string[],
): string {
  // Map task type to conventional commit prefix
  const prefixMap: Record<string, string> = {
    fix: "fix",
    create: "feat",
    refactor: "refactor",
    investigate: "chore",
  };

  const prefix = prefixMap[plan.taskType] ?? "chore";
  const scope = plan.scope === "fullstack" ? "" : `(${plan.scope})`;

  // Generate summary from first sub-task description
  const firstTask = plan.subTasks[0];
  const summary = firstTask
    ? firstTask.description.slice(0, 72)
    : plan.taskType;

  // Build body
  const bodyLines: string[] = [];
  if (created.length > 0) {
    bodyLines.push(`Created: ${created.join(", ")}`);
  }
  if (modified.length > 0) {
    bodyLines.push(`Modified: ${modified.join(", ")}`);
  }
  bodyLines.push(
    `Agents: ${plan.subTasks.map((st) => st.agent).join(", ")}`,
  );

  const header = `${prefix}${scope}: ${summary}`;

  return [header, "", ...bodyLines].join("\n");
}

// ── Main Report Generator ─────────────────────────────────────────────

/**
 * Generate a full change report after plan execution.
 */
export function generateChangeReport(
  plan: PlanManifest,
  outputs: SubAgentOutput[],
  reviewResult: ReviewResult,
): ChangeReport {
  const { created, modified, deleted } = collectFileChanges(outputs);

  const totalAdded = modified.reduce((sum, m) => sum + m.added, 0);
  const totalRemoved = modified.reduce((sum, m) => sum + m.removed, 0);

  const impact = estimateImpact(
    created.length,
    modified.length,
    totalAdded,
    totalRemoved,
    reviewResult,
  );

  const commitMessage = generateCommitMessage(
    plan,
    created,
    modified.map((m) => m.path),
  );

  return {
    planId: plan.planId,
    taskSummary: `[${plan.taskType}] ${plan.scope} — ${plan.subTasks.length} sub-tasks`,
    createdFiles: created,
    modifiedFiles: modified,
    deletedFiles: deleted,
    review: {
      critical: reviewResult.criticalCount,
      warning: reviewResult.warningCount,
      suggestion: reviewResult.suggestionCount,
      autoFixed: reviewResult.autoFixedCount,
      hasCritical: reviewResult.hasCritical,
      summary: reviewResult.summary,
    },
    totalAdded,
    totalRemoved,
    agentOutputs: outputs
      .filter((o) => o.success)
      .map((o) => ({
        agent: plan.subTasks.find((st) => st.id === o.subTaskId)?.agent ?? "unknown",
        success: o.success,
        summary: (o.output ?? "").slice(0, 200),
      })),
    estimatedImpact: impact,
    commitMessage,
    generatedAt: Date.now(),
  };
}

// ── Report Formatter ──────────────────────────────────────────────────

/**
 * Format a change report as a user-facing Markdown card.
 */
export function formatChangeReportCard(report: ChangeReport): string {
  const lines: string[] = [
    `## 📋 变更报告`,
    ``,
    `**${report.taskSummary}**`,
    ``,
    `### 文件变更`,
    ``,
    `| 状态 | 文件 | 变更 |`,
    `|------|------|------|`,
  ];

  for (const f of report.createdFiles) {
    lines.push(`| ✅ 新增 | \`${f}\` | — |`);
  }
  for (const f of report.modifiedFiles) {
    lines.push(
      `| ✏️ 修改 | \`${f.path}\` | +${f.added} / -${f.removed} |`,
    );
  }
  for (const f of report.deletedFiles) {
    lines.push(`| ❌ 删除 | \`${f}\` | — |`);
  }

  lines.push(
    ``,
    `**总计**: +${report.totalAdded} / -${report.totalRemoved} 行`,
    ``,
    `### 审查结果`,
    ``,
    report.review.summary,
    ``,
    `### 影响评估`,
    ``,
    report.estimatedImpact,
    ``,
    `### Commit Message`,
    ``,
    "```",
    report.commitMessage,
    "```",
    ``,
    `---`,
    `[确认合并] [查看详情] [放弃变更]`,
  );

  return lines.join("\n");
}
