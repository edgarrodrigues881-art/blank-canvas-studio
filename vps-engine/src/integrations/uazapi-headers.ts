// ══════════════════════════════════════════════════════════
// VPS Engine — UAZAPI shared header builder
// Centralizes auth header injection + token validation + safe logging
// ══════════════════════════════════════════════════════════

import { createLogger } from "../core/logger";

const log = createLogger("uazapi-auth");

export class MissingUazapiTokenError extends Error {
  constructor(context = "uazapi") {
    super(`Missing UAZAPI token for request (${context}). Refusing to call API without authentication.`);
    this.name = "MissingUazapiTokenError";
  }
}

function maskToken(token: string): string {
  if (!token) return "<empty>";
  if (token.length <= 8) return `${token[0] || "*"}***`;
  return `${token.slice(0, 4)}***${token.slice(-2)}`;
}

// ── Mobile User-Agent pool (real devices, rotated per-request) ──
// Used to vary the "fingerprint" of outgoing requests so the upstream API
// (and downstream WhatsApp) doesn't see a constant automated signature.
const MOBILE_USER_AGENTS = [
  // Android Chrome
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.99 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; moto g(60)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  // iPhone Safari
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // WhatsApp Mobile
  "WhatsApp/2.24.10.85 A",
  "WhatsApp/2.24.9.78 i",
] as const;

function pickUserAgent(): string {
  return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
}

/**
 * Generates a non-sequential, high-entropy request id. Uses crypto.randomUUID
 * when available; falls back to a base36 random combo. The id is intentionally
 * not derived from a counter or timestamp prefix so successive requests do
 * not expose any monotonic pattern.
 */
function generateRequestId(): string {
  try {
    // @ts-ignore — present in modern Node runtimes
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      // @ts-ignore
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  const a = Math.random().toString(36).slice(2, 10);
  const b = Math.random().toString(36).slice(2, 10);
  const c = Math.random().toString(36).slice(2, 6);
  return `${a}-${b}-${c}`;
}

/**
 * Build authenticated headers for UAZAPI requests.
 * Includes BOTH `token` (UAZAPI native) and `Authorization: Bearer <token>` and `apikey`
 * for maximum compatibility with provider endpoints.
 *
 * Anti-detection extras:
 *   - Rotates a real mobile User-Agent per request.
 *   - Attaches a random (non-sequential) X-Request-Id so traffic does not
 *     expose a monotonic counter pattern that scrapers/AB systems can flag.
 *
 * Throws MissingUazapiTokenError if token is missing/empty.
 */
export function buildUazapiHeaders(
  token: string,
  options: { json?: boolean; context?: string; extra?: Record<string, string> } = {},
): Record<string, string> {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    log.error("UAZAPI request blocked: missing token", { context: options.context || "unknown" });
    throw new MissingUazapiTokenError(options.context);
  }

  const userAgent = pickUserAgent();
  const requestId = generateRequestId();

  const headers: Record<string, string> = {
    token: cleanToken,
    Authorization: `Bearer ${cleanToken}`,
    apikey: cleanToken,
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "User-Agent": userAgent,
    "X-Request-Id": requestId,
    ...(options.extra || {}),
  };
  if (options.json) headers["Content-Type"] = "application/json";

  log.debug("UAZAPI auth headers attached", {
    context: options.context || "uazapi",
    token: maskToken(cleanToken),
    ua: userAgent.slice(0, 40),
    rid: requestId.slice(0, 8),
  });

  return headers;
}

export function assertUazapiToken(token: string, context = "uazapi"): string {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    log.error("UAZAPI request blocked: missing token", { context });
    throw new MissingUazapiTokenError(context);
  }
  return cleanToken;
}
