// ══════════════════════════════════════════════════════════
// VPS Engine — Logger por processo/worker
// ══════════════════════════════════════════════════════════

type LogLevel = "info" | "warn" | "error" | "debug";

function collectKeys(value: object): string[] {
  return Array.from(new Set([...Object.keys(value), ...Object.getOwnPropertyNames(value)]));
}

function normalizeForLog(value: any, seen = new WeakSet<object>()): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(value.entries());
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return {
      ok: value.ok,
      status: value.status,
      statusText: value.statusText,
      url: value.url,
      headers: normalizeForLog(value.headers, seen),
    };
  }

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Error) {
    const errorRecord: Record<string, unknown> = {};
    for (const key of new Set(["name", "message", "stack", "cause", ...collectKeys(value)])) {
      try {
        const keyValue = (value as any)[key];
        if (keyValue !== undefined) {
          errorRecord[key] = normalizeForLog(keyValue, seen);
        }
      } catch (err: any) {
        errorRecord[key] = `[Unreadable:${err?.message || "unknown"}]`;
      }
    }
    return errorRecord;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForLog(item, seen));
  }

  const record: Record<string, unknown> = {};
  for (const key of collectKeys(value)) {
    try {
      record[key] = normalizeForLog((value as any)[key], seen);
    } catch (err: any) {
      record[key] = `[Unreadable:${err?.message || "unknown"}]`;
    }
  }

  if (Object.keys(record).length === 0) {
    record.__string = String(value);
  }

  return record;
}

function safeMetaString(meta: any): string {
  try {
    return JSON.stringify(normalizeForLog(meta));
  } catch (err: any) {
    return JSON.stringify({
      loggerSerializationError: err?.message || "unknown",
      fallback: String(meta),
    });
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, worker: string, message: string, meta?: any) {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}] [${worker}]`;
  const metaStr = meta ? ` ${safeMetaString(meta)}` : "";
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
