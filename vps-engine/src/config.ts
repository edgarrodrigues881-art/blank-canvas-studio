// ══════════════════════════════════════════════════════════
// VPS Engine — Configuração central
// ══════════════════════════════════════════════════════════

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",

  port: Number(process.env.PORT) || 3500,

  // Concurrency
  maxConcurrentDevices: Number(process.env.MAX_CONCURRENT_DEVICES) || 10,
  tickIntervalMs: Number(process.env.TICK_INTERVAL_MS) || 30_000,
  campaignTickMs: Number(process.env.CAMPAIGN_TICK_MS) || 60_000,
  communityTickMs: Number(process.env.COMMUNITY_TICK_MS) || 120_000,

  // API
  apiTimeoutMs: 25_000,

  // Operating window (BRT)
  windowStartHour: 7,
  windowEndHour: 19,
};

// ── Startup validation ──
export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!config.supabaseUrl) {
    errors.push("SUPABASE_URL is required");
  } else if (!config.supabaseUrl.startsWith("https://")) {
    errors.push("SUPABASE_URL must start with https://");
  }

  if (!config.supabaseServiceKey) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is required");
  } else {
    // Validate it's a JWT
    const parts = config.supabaseServiceKey.split(".");
    if (parts.length !== 3) {
      errors.push("SUPABASE_SERVICE_ROLE_KEY does not look like a valid JWT (expected 3 parts separated by dots)");
    } else {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        if (payload.role !== "service_role") {
          errors.push(`SUPABASE_SERVICE_ROLE_KEY has role="${payload.role}" — expected "service_role". You might be using the anon key by mistake.`);
        }
      } catch {
        errors.push("SUPABASE_SERVICE_ROLE_KEY JWT payload could not be decoded");
      }
    }
  }

  if (!config.supabaseAnonKey) {
    errors.push("SUPABASE_ANON_KEY is required (used to call Edge Functions)");
  } else {
    const parts = config.supabaseAnonKey.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        if (payload.role !== "anon") {
          errors.push(`SUPABASE_ANON_KEY has role="${payload.role}" — expected "anon". Keys might be swapped.`);
        }
      } catch { /* ignore */ }
    }
  }

  return errors;
}
