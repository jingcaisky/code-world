/**
 * Action: image-analyze
 * Multi-modal: analyze images (screenshots, diagrams, UI mockups, code screenshots)
 * Uses Gemini Vision or Claude Vision for image understanding.
 *
 * Part of: Code World — Multi-Modal Understanding
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `分析图片内容（截图、UI设计稿、架构图、代码截图等）。
支持 PNG/JPG/WebP 格式，通过多模态模型理解图片内容并返回文本描述。
用于理解UI mockup、分析错误截图、看懂架构图等场景。`,

  schema: z.object({
    imagePath: z.string().describe("图片文件路径（相对于项目根目录）"),
    question: z.string().optional().describe("关于图片的具体问题，如'这个UI有什么问题？'"),
    mode: z.enum(["describe", "extract-code", "find-issues"]).optional().default("describe")
      .describe("分析模式：describe=描述内容, extract-code=提取代码, find-issues=找问题"),
  }),

  http: { method: "POST" },

  run: async ({ imagePath, question, mode }) => {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");

    const cwd = process.cwd();
    const resolved = nodePath.resolve(cwd, imagePath);

    if (!resolved.startsWith(cwd)) {
      return { error: "Access denied", path: imagePath };
    }

    // Read image as base64
    let base64: string;
    let mimeType: string;
    try {
      const ext = nodePath.extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
      };
      mimeType = mimeMap[ext] || "image/png";
      base64 = (await fs.readFile(resolved)).toString("base64");
    } catch {
      return { error: "File not found or unreadable", path: imagePath };
    }

    // Build prompt by mode
    const prompts: Record<string, string> = {
      describe: "Describe this image in detail. What do you see? Include any text, UI elements, diagrams, or code visible.",
      "extract-code": "Extract any code visible in this image. Return the code as a well-formatted code block.",
      "find-issues": "Find any issues, errors, or problems visible in this image. Focus on UI bugs, error messages, or design problems.",
    };

    const prompt = question ?? prompts[mode];

    // Try Gemini Vision API if key is configured
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AGENT_NATIVE_GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: base64 } },
                ],
              }],
            }),
            signal: AbortSignal.timeout(15000),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return {
              path: imagePath,
              mode,
              analysis: text,
              provider: "gemini",
            };
          }
        }
      } catch { /* fall through */ }
    }

    // Return base64 data for the agent to use in its own multimodal call
    return {
      path: imagePath,
      mode,
      mimeType,
      sizeBytes: base64.length,
      note: "Image loaded. Use this base64 data in a multimodal API call.",
      imageData: `data:${mimeType};base64,${base64.slice(0, 100)}... (${Math.round(base64.length / 1024)}KB, truncated in action response)`,
      hint: "Set GEMINI_API_KEY for automatic image analysis via Gemini Vision.",
    };
  },
});
