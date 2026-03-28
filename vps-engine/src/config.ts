// ══════════════════════════════════════════════════════════
// VPS Engine — Configuração central
// ══════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const runtimeRoot = path.resolve(__dirname, "..");
const preferredRoot = "/root/blank-canvas-studio/vps-engine";
const appRoot = fs.existsSync(preferredRoot) ? preferredRoot : runtimeRoot;
const currentWorkingEnvPath = path.resolve(process.cwd(), ".env");

const envCandidates = [
  process.env.VPS_ENGINE_ENV_PATH,
  path.join(appRoot, ".env"),
  currentWorkingEnvPath,
].filter((value): value is string => Boolean(value));

const envBeforeLoad = Object.fromEntries(
  ENV_KEYS.map((key) => [key, Boolean(process.env[key])]),
) as Record<EnvKey, boolean>;

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
const dotenvResult = envPath
  ? loadDotenv({ path: envPath, override: false })
  : undefined;

if (envPath) {
  process.env.VPS_ENGINE_ENV_PATH = envPath;
}

function envSource(key: EnvKey): string {
  if (envBeforeLoad[key]) return "process.env";
  if (envPath && process.env[key]) return `.env:${envPath}`;
  return "absent";
}

console.info(
  "[env] runtime diagnostics",
  JSON.stringify({
    cwd: process.cwd(),
    runtimeRoot,
    appRoot,
    envFileFound: Boolean(envPath),
    envFilePath: envPath ?? null,
    dotenvLoaded: Boolean(dotenvResult),
    dotenvError: dotenvResult?.error?.message ?? null,
    loaded: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
    },
    source: {
      SUPABASE_URL: envSource("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: envSource("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_ANON_KEY: envSource("SUPABASE_ANON_KEY"),
    },
  }),
);

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  defaultUazapiToken: process.env.UAZAPI_TOKEN || "",
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
    console.warn("⚠ SUPABASE_ANON_KEY not set — Edge Function calls will be skipped. Direct DB warmup will still work.");
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
