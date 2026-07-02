/**
 * Terminal Session Manager
 *
 * Manages persistent terminal sessions for long-running commands
 * (dev servers, watchers, debuggers). Each session has an id,
 * accumulated output buffer, and can be read/killed independently.
 */

import { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";

interface TerminalSession {
  id: string;
  command: string;
  process: ChildProcess;
  output: string[];
  maxLines: number;
  startedAt: number;
  emitter: EventEmitter;
}

const sessions = new Map<string, TerminalSession>();
let sessionCounter = 0;

const DEFAULT_MAX_LINES = 500;

export function startSession(
  command: string,
  options: { cwd?: string; maxLines?: number } = {},
): { sessionId: string; command: string } {
  const id = `term-${++sessionCounter}-${Date.now()}`;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const output: string[] = [];
  const emitter = new EventEmitter();

  const child = spawn(command, {
    shell: process.platform === "win32" ? "powershell" : "/bin/bash",
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const append = (line: string) => {
    output.push(line);
    if (output.length > maxLines) output.shift();
    emitter.emit("data", line);
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach(append);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach((l) => append(`[stderr] ${l}`));
  });

  child.on("close", (code) => {
    append(`[Process exited with code ${code}]`);
    emitter.emit("close", code);
  });

  child.on("error", (err) => {
    append(`[Process error: ${err.message}]`);
    emitter.emit("error", err);
  });

  const session: TerminalSession = {
    id,
    command,
    process: child,
    output,
    maxLines,
    startedAt: Date.now(),
    emitter,
  };

  sessions.set(id, session);
  return { sessionId: id, command };
}

export function getSession(sessionId: string): TerminalSession | null {
  return sessions.get(sessionId) ?? null;
}

export function getSessionOutput(sessionId: string): string[] | null {
  const session = sessions.get(sessionId);
  return session ? [...session.output] : null;
}

export function sendToSession(sessionId: string, input: string): boolean {
  const session = sessions.get(sessionId);
  if (!session?.process.stdin) return false;
  session.process.stdin.write(input + "\n");
  return true;
}

export function killSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.process.kill("SIGTERM");
  setTimeout(() => {
    if (session.process.exitCode === null) {
      session.process.kill("SIGKILL");
    }
  }, 3000);
  sessions.delete(sessionId);
  return true;
}

export function listSessions(): Array<{
  id: string; command: string; lines: number; uptimeMs: number; alive: boolean;
}> {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    command: s.command,
    lines: s.output.length,
    uptimeMs: Date.now() - s.startedAt,
    alive: s.process.exitCode === null,
  }));
}

export function listProcesses(): Array<{
  pid: number; command: string; uptimeMs: number;
}> {
  return [...sessions.values()].map((s) => ({
    pid: s.process.pid ?? 0,
    command: s.command,
    uptimeMs: Date.now() - s.startedAt,
  }));
}
