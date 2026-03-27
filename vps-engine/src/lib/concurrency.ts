// ══════════════════════════════════════════════════════════
// VPS Engine — Controle de concorrência (Semaphore)
// ══════════════════════════════════════════════════════════

export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }

  get active(): number {
    return this.current;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

/**
 * Processa items em lotes com concorrência limitada.
 */
export async function processBatch<T>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  const sem = new Semaphore(concurrency);
  let succeeded = 0;
  let failed = 0;

  await Promise.allSettled(
    items.map(async (item) => {
      await sem.acquire();
      try {
        await processor(item);
        succeeded++;
      } catch {
        failed++;
      } finally {
        sem.release();
      }
    }),
  );

  return { succeeded, failed };
}
