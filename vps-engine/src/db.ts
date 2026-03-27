// ══════════════════════════════════════════════════════════
// VPS Engine — Supabase client (service role)
// ══════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!_client) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    _client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return _client;
}
