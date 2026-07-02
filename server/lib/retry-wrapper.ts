/**
 * Error Auto-Retry Wrapper
 *
 * Wraps execution operations with intelligent retry logic.
 * Only retries on transient errors (network, registry), never on
 * permanent errors (type mismatch, missing files, logic errors).
 *
 * System-level capability — not an Action. Used internally by
 * run-command, run-test, file-update, and other execution tools.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum retry attempts (excluding the initial try) */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Backoff multiplier (e.g., 2 = exponential: 1s, 2s, 4s) */
  backoffMultiplier?: number;
  /** Custom function to decide if an error is retryable */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Called before each retry attempt */
  onRetry?: (error: Error, attempt: number, nextAttemptIn: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

// ── Default Error Classifier ────────────────────────────────────────

/** Error categories that are always retryable */
const RETRYABLE_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /EPIPE/i,
  /network/i,
  /timeout/i,
  /temporary/i,
  /retry/i,
  /rate.?limit/i,
  /too many requests/i,
  /service unavailable/i,
  /gateway timeout/i,
  /bad gateway/i,
];

/** Error categories that are NEVER retryable */
const NON_RETRYABLE_ERROR_PATTERNS = [
  /ENOENT/i,         // File not found
  /EACCES/i,         // Permission denied
  /EPERM/i,          // Operation not permitted
  /type error/i,     // TypeScript error
  /syntax error/i,   // Syntax error
  /not found/i,      // Resource not found
  /invalid/i,        // Invalid input
  /unauthorized/i,   // Auth error
  /forbidden/i,      // Access denied
  /ENOSPC/i,         // No space left
  /EMFILE/i,         // Too many open files
  /assert/i,         // Assertion failed
  /test fail/i,      // Test failure (logic error, not infrastructure)
];

/** Exit codes that suggest retryable infrastructure issues */
const RETRYABLE_EXIT_CODES = new Set([130, 137, 143]); // SIGINT, SIGKILL, SIGTERM

/**
 * Determine if an error is retryable based on message patterns.
 */
export function isRetryable(error: Error): boolean {
  const msg = error.message ?? "";

  // Check non-retryable first (explicit denials)
  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(msg)) return false;
  }

  // Check retryable patterns
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(msg)) return true;
  }

  // Check for known exit codes
  if (/exit code (\d+)/i.test(msg)) {
    const match = msg.match(/exit code (\d+)/i);
    if (match && RETRYABLE_EXIT_CODES.has(parseInt(match[1]))) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

// ── Retry Wrapper ────────────────────────────────────────────────────

/**
 * Execute a function with automatic retry on transient failures.
 *
 * Usage:
 * ```ts
 * const result = await retry(
 *   () => execAsync("npm install"),
 *   { maxRetries: 3, onRetry: (e, n) => console.log(`Retrying (${n}/3)...`) }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = 2,
    retryDelay = 1000,
    backoffMultiplier = 2,
    shouldRetry = isRetryable,
    onRetry,
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      attempt++;

      const err = error instanceof Error ? error : new Error(String(error));

      // Don't retry if we've exhausted attempts or error is not retryable
      if (attempt > maxRetries || !shouldRetry(err, attempt)) {
        return {
          success: false,
          error: err,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Calculate backoff delay
      const delay = retryDelay * Math.pow(backoffMultiplier, attempt - 1);
      onRetry?.(err, attempt, delay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Convenience wrapper that throws on final failure instead of returning Result.
 * Use when you want try/catch semantics rather than checking result.success.
 */
export async function retryOrThrow<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const result = await retry(fn, options);
  if (!result.success) throw result.error!;
  return result.result!;
}

// ── Shell Command Retry ──────────────────────────────────────────────

/**
 * Specialized retry for shell commands with exit code awareness.
 * Retries on infrastructure-like exit codes (SIGTERM, SIGKILL).
 */
export async function retryCommand(
  command: string,
  options: RetryOptions & { cwd?: string; timeout?: number } = {},
): Promise<RetryResult<{ stdout: string; stderr: string; exitCode: number | null }>> {
  const { exec } = await import("node:child_process");

  return retry(
    () =>
      new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
        (resolve, reject) => {
          const child = exec(
            command,
            {
              cwd: options.cwd ?? process.cwd(),
              timeout: options.timeout ?? 30000,
              maxBuffer: 100_000,
              env: { ...process.env },
            },
            (err, stdout, stderr) => {
              if (err && err.killed) {
                // Process was killed (timeout/signal) — retryable
                reject(err);
              } else if (err) {
                // Check exit code for retryability
                const exitMatch = String(err.message).match(/exit code (\d+)/);
                const exitCode = exitMatch ? parseInt(exitMatch[1]) : null;
                if (
                  exitCode !== null &&
                  RETRYABLE_EXIT_CODES.has(exitCode)
                ) {
                  reject(err);
                } else {
                  // Non-zero exit but not retryable — return result, not error
                  resolve({ stdout, stderr, exitCode: err.message.includes("exit code") ? exitCode : 1 });
                }
              } else {
                resolve({ stdout, stderr, exitCode: 0 });
              }
            },
          );
        },
      ),
    options,
  );
}
