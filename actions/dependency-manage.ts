/**
 * Action: dependency-manage — add/remove npm dependencies
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `添加或移除 npm 依赖包。自动检测 pnpm/npm/yarn。`,
  schema: z.object({
    operation: z.enum(["add", "remove"]),
    packages: z.array(z.string()).describe("包名列表"),
    dev: z.boolean().optional().default(false),
  }),
  http: { method: "POST" },
  run: async ({ operation, packages, dev }) => {
    const fs = await import("node:fs/promises");
    let pm = "pnpm";
    try { const pkg = JSON.parse(await fs.readFile("package.json", "utf-8")); if (pkg.packageManager?.includes("yarn")) pm = "yarn"; else if (pkg.packageManager?.includes("npm")) pm = "npm"; } catch { /* */ }

    const { execSync } = await import("node:child_process");
    if (operation === "remove") {
      try {
        const out = execSync(`${pm} remove ${packages.join(" ")}`, { cwd: process.cwd(), timeout: 60000, encoding: "utf-8" });
        return { removed: packages, output: out.slice(-300) };
      } catch (e: any) { return { error: e?.stderr?.toString() ?? e?.message ?? String(e) }; }
    }
    if (operation === "add") {
      const devFlag = dev ? (pm === "yarn" ? "--dev" : "--save-dev") : "";
      try {
        const out = execSync(`${pm} add ${devFlag} ${packages.join(" ")}`, { cwd: process.cwd(), timeout: 120000, encoding: "utf-8" });
        return { added: packages, dev, output: out.slice(-300) };
      } catch (e: any) { return { error: e?.stderr?.toString() ?? e?.message ?? String(e) }; }
    }
    return { error: "Unknown operation" };
  },
});
