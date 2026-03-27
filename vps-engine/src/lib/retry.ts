// ══════════════════════════════════════════════════════════
// VPS Engine — Retry com exponential backoff
// ══════════════════════════════════════════════════════════

export function backoffMinutes(attempt: number): number {
  return [5, 15, 60, 180, 360][Math.min(attempt, 4)];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    isRetryable?: (error: any) => boolean;
  } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const minDelay = opts.minDelayMs ?? 5_000;
  const maxDelay = opts.maxDelayMs ?? 30_000;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !isRetryable(err)) throw err;
      const delay = Math.min(minDelay * Math.pow(2, attempt) + Math.random() * 2000, maxDelay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
