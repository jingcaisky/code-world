/**
 * Action: terminal (terminal-start / terminal-session / terminal-kill)
 *
 * Persistent terminal session management for long-running commands.
 * Unified action — operation parameter controls behavior.
 *
 * Uses: server/lib/terminal-manager.ts
 */

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

export default defineAction({
  description: `管理持久终端会话，支持长时间运行的命令（dev server、watch 模式等）。

操作类型：
- start: 启动新的终端会话（如 npm run dev）
- read: 读取指定会话的输出
- send: 向会话发送输入（如 Ctrl+C 信号）
- list: 列出所有活跃会话
- kill: 终止指定会话`,
  schema: z.object({
    operation: z.enum(["start", "read", "send", "list", "kill"])
      .describe("终端操作类型"),
    command: z.string().optional().describe("要执行的命令（operation=start 时必需）"),
    sessionId: z.string().optional().describe("会话 ID（operation=read/send/kill 时必需）"),
    input: z.string().optional().describe("发送到终端的输入（operation=send 时使用）"),
    lines: z.number().optional().default(50).describe("读取的输出行数（operation=read 时使用）"),
  }),
  http: { method: "POST" },
  run: async (params) => {
    const { startSession, getSessionOutput, sendToSession, listSessions, killSession } =
      await import("../server/lib/terminal-manager");

    switch (params.operation) {
      case "start": {
        if (!params.command) return { error: "command is required for start" };
        const session = startSession(params.command);
        return { ...session, hint: "Use terminal operation=read with sessionId to see output" };
      }
      case "read": {
        if (!params.sessionId) return { error: "sessionId is required for read" };
        const output = getSessionOutput(params.sessionId);
        if (!output) return { error: "Session not found or already terminated" };
        const tail = output.slice(-(params.lines ?? 50));
        return { sessionId: params.sessionId, lines: tail.length, output: tail.join("\n"), running: true };
      }
      case "send": {
        if (!params.sessionId || !params.input) return { error: "sessionId and input are required" };
        const ok = sendToSession(params.sessionId, params.input);
        return { sessionId: params.sessionId, sent: ok };
      }
      case "list": {
        return { sessions: listSessions() };
      }
      case "kill": {
        if (!params.sessionId) return { error: "sessionId is required for kill" };
        const killed = killSession(params.sessionId);
        return { sessionId: params.sessionId, killed };
      }
      default:
        return { error: `Unknown operation: ${params.operation}` };
    }
  },
});
