import cron from "node-cron";
import { createLogger } from "../utils/logger.js";

const log = createLogger("cron");

/**
 * Register all scheduled jobs here.
 *
 * Example:
 *   import { sampleWorkerTick } from "../workers/sample-worker.js";
 *   cron.schedule("* * * * *", () => sampleWorkerTick().catch(() => {}));
 */
export function registerCronJobs() {
  log.info("Registering cron jobs");
  // (none registered yet — add as you migrate Edge Functions)
  log.info("Cron jobs registered: 0");
}
