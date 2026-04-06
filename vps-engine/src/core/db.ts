// ══════════════════════════════════════════════════════════
// VPS Engine — Supabase client (service role)
// ══════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, validateConfig } from "./config";
import { withRetry } from "./lib/retry";

let _client: SupabaseClient | null = null;

function isRetryableNetworkError(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error ?? ""),
    error instanceof Error && "cause" in error ? String((error as any).cause?.message ?? "") : "",
  ].join(" ").toLowerCase();

  return [
    "fetch failed",
    "connect timeout",
    "und_err_connect_timeout",
    "etimedout",
    "econnreset",
    "eai_again",
    "enotfound",
    "socket hang up",
    "network",
    "terminated",
  ].some((token) => message.includes(token));
}

const resilientFetch: typeof fetch = async (input, init) => {
  return withRetry(
    () => fetch(input, init),
    {
      maxRetries: 3,
      minDelayMs: 1_500,
      maxDelayMs: 8_000,
      isRetryable: isRetryableNetworkError,
    },
  );
};

export function getDb(): SupabaseClient {
  if (!_client) {
    // Validate config before creating client
    const errors = validateConfig();
    if (errors.length > 0) {
      console.error("╔══════════════════════════════════════════╗");
      console.error("║  VPS ENGINE — CONFIGURATION ERRORS       ║");
      console.error("╚══════════════════════════════════════════╝");
      for (const err of errors) {
        console.error(`  ✗ ${err}`);
      }
      throw new Error(`Configuration invalid: ${errors.join("; ")}`);
    }

    _client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: resilientFetch,
      },
    });
  }
  return _client;
}
