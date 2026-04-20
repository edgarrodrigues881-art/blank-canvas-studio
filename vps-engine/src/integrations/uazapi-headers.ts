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

/**
 * Build authenticated headers for UAZAPI requests.
 * Includes BOTH `token` (UAZAPI native) and `Authorization: Bearer <token>` and `apikey`
 * for maximum compatibility with provider endpoints.
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

  const headers: Record<string, string> = {
    token: cleanToken,
    Authorization: `Bearer ${cleanToken}`,
    apikey: cleanToken,
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(options.extra || {}),
  };
  if (options.json) headers["Content-Type"] = "application/json";

  log.debug("UAZAPI auth headers attached", {
    context: options.context || "uazapi",
    token: maskToken(cleanToken),
    hasAuthorization: true,
    hasApikey: true,
    hasToken: true,
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
