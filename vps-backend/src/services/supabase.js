import { createClient } from "@supabase/supabase-js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("supabase");

let _client = null;

export function getSupabase() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    log.warn(
      "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Supabase client will be unavailable until .env is configured.",
    );
    return null;
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  log.info("Supabase client initialized");
  return _client;
}
