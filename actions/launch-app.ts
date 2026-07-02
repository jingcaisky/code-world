/**
 * Launch another agent-native app in a modal iframe.
 *
 * Use this when the user needs the full visual UI of another app — design
 * editing, slide presentation, document editing, video editing, etc.
 * For simple data operations on other apps, use call-agent instead.
 *
 * Usage:
 *   pnpm action launch-app --appId=design
 *   pnpm action launch-app --appId=slides --url=http://localhost:8086
 *
 * Options:
 *   --appId   App ID to launch (e.g., "design", "slides", "content")
 *   --url     Optional explicit URL. If omitted, the default dev URL is used.
 */

import { defineAction } from "@agent-native/core/action";
import { writeAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { LAUNCH_APP_ALLOWED_IDS } from "../config/const.js";

export default defineAction({
  description:
    "Launch another app's full visual UI in a modal iframe. Use this when the user needs to SEE and INTERACT with another app's interface — for example, opening the Design editor for banner creation, opening Slides for presentation editing, opening Content for document editing, or opening the Asset manager for media browsing. For simple data operations (send email, check calendar, search knowledge) use call-agent instead of launch-app.",
  schema: z.object({
    appId: z
      .string()
      .describe(
        `App ID to launch (e.g., ${LAUNCH_APP_ALLOWED_IDS.slice(0, 5).join(", ")}, ...)`,
      ),
    url: z
      .string()
      .optional()
      .describe(
        "Optional explicit URL for the app. If omitted, a default URL is resolved client-side.",
      ),
  }),
  http: false,
  agentTool: true,
  run: async (args) => {
    const appId = args.appId.trim().toLowerCase();

    // Whitelist check: only allow known app IDs
    if (!LAUNCH_APP_ALLOWED_IDS.includes(appId)) {
      return `Error: Unknown app "${args.appId}". Allowed apps: ${LAUNCH_APP_ALLOWED_IDS.join(", ")}`;
    }

    const launch: Record<string, string | boolean> = {
      appId,
      open: true,
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (args.url) launch.url = args.url;
    await writeAppState("launchApp", launch);
    return `Launched app: ${appId}${args.url ? ` at ${args.url}` : ""}`;
  },
});
