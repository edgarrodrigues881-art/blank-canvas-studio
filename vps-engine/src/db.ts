// ══════════════════════════════════════════════════════════
// VPS Engine — Supabase client (service role)
// ══════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, validateConfig } from "./config";

let _client: SupabaseClient | null = null;

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

    _client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return _client;
}
