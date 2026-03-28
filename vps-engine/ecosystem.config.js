const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const preferredCwd = "/root/blank-canvas-studio/vps-engine";
const cwd = fs.existsSync(preferredCwd) ? preferredCwd : __dirname;
const envPath = path.join(cwd, ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

function pickDefinedEnv(keys) {
  return keys.reduce((acc, key) => {
    const value = process.env[key];
    if (typeof value === "string" && value.trim() !== "") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

module.exports = {
  apps: [
    {
      name: "vps-engine",
      cwd,
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PORT: process.env.PORT || 3500,
        ...pickDefinedEnv([
          "SUPABASE_URL",
          "SUPABASE_SERVICE_ROLE_KEY",
          "SUPABASE_ANON_KEY",
          "UAZAPI_TOKEN",
          "UAZAPI_BASE_URL",
          "MAX_CONCURRENT_DEVICES",
          "TICK_INTERVAL_MS",
          "CAMPAIGN_TICK_MS",
          "COMMUNITY_TICK_MS",
          "VPS_ENGINE_ENV_PATH",
        ]),
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
