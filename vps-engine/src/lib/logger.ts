// ══════════════════════════════════════════════════════════
// VPS Engine — Logger por processo/worker
// ══════════════════════════════════════════════════════════

type LogLevel = "info" | "warn" | "error" | "debug";

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, worker: string, message: string, meta?: any) {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}] [${worker}]`;
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `${prefix} ${message}${metaStr}`;

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
      break;
  }
}

export function createLogger(worker: string) {
  return {
    info: (msg: string, meta?: any) => log("info", worker, msg, meta),
    warn: (msg: string, meta?: any) => log("warn", worker, msg, meta),
    error: (msg: string, meta?: any) => log("error", worker, msg, meta),
    debug: (msg: string, meta?: any) => log("debug", worker, msg, meta),
  };
}
