import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      },
  base: { service: "vps-backend" },
});

/**
 * Create a scoped logger (e.g., per worker / route).
 * @param {string} scope
 */
export function createLogger(scope) {
  return logger.child({ scope });
}

/**
 * Standardized job lifecycle helper.
 * Logs start, end (with duration), and errors (with stack).
 *
 *   await runJob("sync-devices", log, async () => { ... });
 *
 * @param {string} jobName
 * @param {pino.Logger} log
 * @param {() => Promise<any>} fn
 */
export async function runJob(jobName, log, fn) {
  const startedAt = Date.now();
  log.info({ job: jobName, event: "job_start" }, `▶ ${jobName} started`);
  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    log.info(
      { job: jobName, event: "job_end", durationMs, ok: true },
      `✔ ${jobName} finished in ${durationMs}ms`,
    );
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    log.error(
      {
        job: jobName,
        event: "job_error",
        durationMs,
        err: { message: err?.message, stack: err?.stack, name: err?.name },
      },
      `✖ ${jobName} failed after ${durationMs}ms: ${err?.message || "unknown error"}`,
    );
    throw err;
  }
}
