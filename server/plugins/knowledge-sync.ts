/**
 * Knowledge Sync Plugin — Startup Hook
 *
 * Automatically synchronizes AGENTS.md → SQL Resources
 * and indexes project files → Vector Database at server startup.
 *
 * Registered as a Nitro plugin so it runs once before handling requests.
 */

import type { NitroApp } from "nitropack";

export default async function knowledgeSyncPlugin(nitroApp: NitroApp) {
  // Hook into the "ready" lifecycle
  nitroApp.hooks.hook("ready", async () => {
    // Import dynamically so it loads after DB is ready
    try {
      const { syncAllKnowledge } = await import("../lib/knowledge-sync");
      await syncAllKnowledge();
    } catch (error) {
      console.warn("[knowledge-sync] Startup sync failed:", error);
    }
  });
}
