/**
 * Action: env-ops — read/set .env variables
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `读取或设置 .env 文件中的环境变量。`,
  schema: z.object({
    operation: z.enum(["read", "set"]),
    key: z.string().optional().describe("环境变量键名"),
    value: z.string().optional().describe("变量值（set 时用）"),
  }),
  http: { method: "POST" },
  run: async ({ operation, key, value }) => {
    const fs = await import("node:fs/promises");
    const envPath = ".env";
    try { await fs.access(envPath); } catch { return { error: ".env not found" }; }
    const content = await fs.readFile(envPath, "utf-8");
    if (operation === "read") {
      const vars: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq > 0) { const k = t.slice(0, eq).trim(); if (!key || k === key) vars[k] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, ""); }
      }
      return { variables: vars };
    }
    if (operation === "set" && key && value !== undefined) {
      const lines = content.split("\n");
      let found = false;
      const updated = lines.map((l) => {
        if (l.trim().startsWith(key + "=")) { found = true; return `${key}=${value.includes(" ") ? `"${value}"` : value}`; }
        return l;
      });
      if (!found) updated.push(`${key}=${value.includes(" ") ? `"${value}"` : value}`);
      await fs.writeFile(envPath, updated.join("\n"), "utf-8");
      return { key, value, set: true };
    }
    return { error: "key and value required for set" };
  },
});
