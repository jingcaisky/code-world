/**
 * Action: process-manage (process-list / process-kill)
 *
 * Manage running processes spawned by the agent.
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `管理系统进程。
list: 查看所有由 Agent 启动的运行中进程
kill: 终止指定 PID 的进程`,
  schema: z.object({
    operation: z.enum(["list", "kill"]),
    pid: z.number().optional().describe("进程 PID（operation=kill 时必需）"),
  }),
  http: { method: "GET" },
  run: async (params) => {
    const { listProcesses, killSession, listSessions } =
      await import("../server/lib/terminal-manager");

    if (params.operation === "list") {
      const terminalProcesses = listProcesses();
      const allSessions = listSessions();
      return { processes: terminalProcesses, sessions: allSessions };
    }

    if (params.operation === "kill") {
      if (!params.pid) return { error: "pid is required for kill" };
      // Kill by finding matching session
      for (const s of listSessions()) {
        const procs = listProcesses();
        const match = procs.find((p) => p.pid === params.pid);
        if (match) {
          killSession(s.id);
          return { pid: params.pid, killed: true };
        }
      }
      return { error: "Process not found", pid: params.pid };
    }

    return { error: "Unknown operation" };
  },
});
