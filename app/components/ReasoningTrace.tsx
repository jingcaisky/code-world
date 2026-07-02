/**
 * ReasoningTrace — Chain of Thought Display
 *
 * Shows the model's step-by-step reasoning (thinking stream) in real-time.
 * Auto-collapses when reasoning completes, keeps the conclusion visible.
 * Follows Claude/DeepSeek patterns: "思考中..." → collapsible thought block.
 *
 * System-level capability — UI component, consumed by the chat page.
 *
 * Part of: Code World Architecture — System Services (Frontend)
 */

import { IconBrain, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────

export interface ThinkingBlock {
  /** Unique block identifier */
  id: string;
  /** Accumulated thinking text */
  text: string;
  /** Whether thinking is still in progress */
  isStreaming: boolean;
  /** When thinking started (ms timestamp) */
  startedAt: number;
  /** Token count estimate */
  tokenCount: number;
}

export interface ThinkingEvent {
  type: "thinking_start" | "thinking_delta" | "thinking_end";
  id?: string;
  text?: string;
}

// ── Component ─────────────────────────────────────────────────────────

interface ReasoningTraceProps {
  blocks: ThinkingBlock[];
  className?: string;
}

export function ReasoningTrace({ blocks, className }: ReasoningTraceProps) {
  if (blocks.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block) => (
        <ThinkingCard key={block.id} block={block} />
      ))}
    </div>
  );
}

// ── Thinking Card ─────────────────────────────────────────────────────

function ThinkingCard({ block }: { block: ThinkingBlock }) {
  const [open, setOpen] = useState(block.isStreaming);
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (block.isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [block.text, block.isStreaming]);

  // Auto-collapse when done
  useEffect(() => {
    if (!block.isStreaming) {
      const timer = setTimeout(() => setOpen(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [block.isStreaming]);

  const duration = block.isStreaming
    ? ((Date.now() - block.startedAt) / 1000).toFixed(1)
    : null;

  // Extract first line as summary
  const summary = block.text.split("\n")[0]?.slice(0, 80) || "思考中...";

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.03] transition-colors">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-purple-500/[0.05]"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10">
          <IconBrain className="size-3.5 text-purple-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              {block.isStreaming ? "思考中..." : "已思考"}
            </span>
            {duration && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {duration}s
              </span>
            )}
            {!block.isStreaming && (
              <span className="text-[10px] text-muted-foreground">
                ~{block.tokenCount} tokens
              </span>
            )}
          </div>
          {!block.isStreaming && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
        {block.isStreaming ? (
          <span className="flex size-4 items-center justify-center">
            <span className="size-2 rounded-full bg-purple-500 animate-pulse" />
          </span>
        ) : (
          open ? (
            <IconChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <IconChevronRight className="size-3.5 text-muted-foreground" />
          )
        )}
      </button>

      {/* Content (collapsible) */}
      {open && (
        <div
          ref={contentRef}
          className="max-h-48 overflow-y-auto border-t border-purple-500/10 px-4 py-3"
        >
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground font-sans">
            {block.text}
            {block.isStreaming && (
              <span className="inline-block w-2 h-3.5 ml-0.5 bg-purple-400 animate-pulse align-middle" />
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Thinking Block Skeleton ───────────────────────────────────────────

/**
 * Skeleton placeholder shown while waiting for the first thinking delta.
 */
export function ThinkingSkeleton() {
  return (
    <div className="rounded-xl border border-purple-500/10 bg-purple-500/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-purple-500/15 bg-purple-500/5">
          <IconBrain className="size-3.5 text-purple-400 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-purple-500/70">思考中...</span>
          <span className="flex gap-1">
            <span className="size-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Hook to manage thinking blocks from SSE events.
 */
export function useReasoningTrace() {
  const [blocks, setBlocks] = useState<ThinkingBlock[]>([]);

  const startThinking = () => {
    const id = `think-${Date.now()}`;
    setBlocks((prev) => [
      ...prev,
      {
        id,
        text: "",
        isStreaming: true,
        startedAt: Date.now(),
        tokenCount: 0,
      },
    ]);
    return id;
  };

  const appendDelta = (id: string, text: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              text: b.text + text,
              tokenCount: b.tokenCount + Math.ceil(text.length / 3.5),
            }
          : b,
      ),
    );
  };

  const endThinking = (id: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, isStreaming: false } : b,
      ),
    );
  };

  const clear = () => setBlocks([]);

  return {
    blocks,
    startThinking,
    appendDelta,
    endThinking,
    clear,
    hasActiveThinking: blocks.some((b) => b.isStreaming),
  };
}
