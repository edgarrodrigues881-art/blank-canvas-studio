// ══════════════════════════════════════════════════════════
// VPS Engine — Configuração central
// ══════════════════════════════════════════════════════════

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  defaultUazapiBaseUrl: (process.env.UAZAPI_BASE_URL || "").replace(/\/+$/, ""),

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

function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64").toString());
  } catch {
    return null;
  }
}

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
    if (!config.supabaseServiceKey.startsWith("sb_secret_")) {
      const payload = decodeJwtPayload(config.supabaseServiceKey);
      if (!payload) {
        errors.push("SUPABASE_SERVICE_ROLE_KEY must be a valid sb_secret key or service_role JWT");
      } else if (payload.role !== "service_role") {
        errors.push(`SUPABASE_SERVICE_ROLE_KEY has role="${payload.role}" — expected "service_role". You might be using the anon/publishable key by mistake.`);
      }
    }
  }

  if (!config.supabaseAnonKey) {
    errors.push("SUPABASE_ANON_KEY is required (used to call Edge Functions)");
  } else {
    if (!config.supabaseAnonKey.startsWith("sb_publishable_")) {
      const payload = decodeJwtPayload(config.supabaseAnonKey);
      if (payload && payload.role !== "anon") {
        errors.push(`SUPABASE_ANON_KEY has role="${payload.role}" — expected "anon". Keys might be swapped.`);
      }
    }
  }

  return errors;
}
