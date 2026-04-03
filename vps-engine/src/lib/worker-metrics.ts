// ══════════════════════════════════════════════════════════
// VPS Engine — Worker Metrics (Operational Observability)
// Tracks per-worker timing, throughput and backlog stats.
// ══════════════════════════════════════════════════════════

export interface TickStats {
  lastDurationMs: number | null;
  avgDurationMs: number;
  maxDurationMs: number;
  totalTicks: number;
  totalErrors: number;
  skippedTicks: number;
  lastTickAt: string | null;
  isRunning: boolean;
}

const ROLLING_WINDOW = 50; // keep last N durations for avg

class WorkerMetrics {
  private durations = new Map<string, number[]>();
  private maxDuration = new Map<string, number>();
  private ticks = new Map<string, number>();
  private errors = new Map<string, number>();
  private skipped = new Map<string, number>();
  private lastDuration = new Map<string, number>();
  private lastTickAt = new Map<string, string>();
  private running = new Map<string, boolean>();

  recordTick(worker: string, durationMs: number) {
    const arr = this.durations.get(worker) || [];
    arr.push(durationMs);
    if (arr.length > ROLLING_WINDOW) arr.shift();
    this.durations.set(worker, arr);
    this.lastDuration.set(worker, durationMs);
    this.ticks.set(worker, (this.ticks.get(worker) || 0) + 1);
    this.lastTickAt.set(worker, new Date().toISOString());
    const prev = this.maxDuration.get(worker) || 0;
    if (durationMs > prev) this.maxDuration.set(worker, durationMs);
  }

  recordError(worker: string) {
    this.errors.set(worker, (this.errors.get(worker) || 0) + 1);
  }

  recordSkip(worker: string) {
    this.skipped.set(worker, (this.skipped.get(worker) || 0) + 1);
  }

  setRunning(worker: string, value: boolean) {
    this.running.set(worker, value);
  }

  getStats(worker: string): TickStats {
    const arr = this.durations.get(worker) || [];
    const avg = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    return {
      lastDurationMs: this.lastDuration.get(worker) ?? null,
      avgDurationMs: avg,
      maxDurationMs: this.maxDuration.get(worker) || 0,
      totalTicks: this.ticks.get(worker) || 0,
      totalErrors: this.errors.get(worker) || 0,
      skippedTicks: this.skipped.get(worker) || 0,
      lastTickAt: this.lastTickAt.get(worker) || null,
      isRunning: this.running.get(worker) || false,
    };
  }

  getAllStats(): Record<string, TickStats> {
    const workers = new Set([
      ...this.ticks.keys(),
      ...this.running.keys(),
      ...this.skipped.keys(),
    ]);
    const result: Record<string, TickStats> = {};
    for (const w of workers) result[w] = this.getStats(w);
    return result;
  }
}

export const workerMetrics = new WorkerMetrics();
