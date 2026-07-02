/**
 * Action: code-review
 *
 * Run a comprehensive code review pipeline on specified files.
 * Checks TypeScript types, linting rules, security patterns,
 * CodeGraph dependencies, and accessibility.
 *
 * Part of: Code World Architecture Spec v1.0 — Layer 3
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import {
  runFullReview,
  formatReviewReport,
  type ReviewResult,
} from "../server/lib/review-checker";

export default defineAction({
  description: `对指定文件执行全面的代码审查。
检查类型安全、代码风格、安全性、依赖关系和可访问性。
返回分级报告：critical（阻塞）、warning（警告）、suggestion（建议）。`,

  schema: z.object({
    files: z
      .array(z.string())
      .describe("要审查的文件路径列表"),
    checklist: z
      .array(z.string())
      .optional()
      .describe("额外的审查检查项"),
    skipAutoFix: z
      .boolean()
      .optional()
      .default(false)
      .describe("是否跳过自动修复"),
  }),

  http: { method: "POST" },

  run: async ({ files, checklist, skipAutoFix }) => {
    if (files.length === 0) {
      return {
        error: "No files specified for review",
        totalFindings: 0,
      };
    }

    const result: ReviewResult = await runFullReview(files, {
      skipAutoFix,
      checklist,
    });

    return {
      ...result,
      report: formatReviewReport(result),
      reviewedFiles: files.length,
    };
  },
});
