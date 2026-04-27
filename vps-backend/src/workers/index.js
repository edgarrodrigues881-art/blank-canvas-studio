/**
 * Worker registry.
 *
 * Workers are background units of work, typically invoked from cron jobs
 * (see /src/cron) or HTTP routes (see /src/routes). Each worker should
 * export a single async function and use `runJob` from utils/logger to
 * get standardized start/end/error logs.
 *
 * Example skeleton:
 *
 *   // src/workers/sample-worker.js
 *   import { createLogger, runJob } from "../utils/logger.js";
 *   const log = createLogger("sample-worker");
 *   export async function sampleWorkerTick() {
 *     return runJob("sample-worker", log, async () => {
 *       // ... do work
 *       return { processed: 0 };
 *     });
 *   }
 */
export {};
