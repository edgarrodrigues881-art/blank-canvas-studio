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
