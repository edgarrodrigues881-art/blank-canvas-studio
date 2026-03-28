// Load .env before exporting config
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

module.exports = {
  apps: [
    {
      name: "vps-engine",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3500,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        MAX_CONCURRENT_DEVICES: process.env.MAX_CONCURRENT_DEVICES || 10,
        TICK_INTERVAL_MS: process.env.TICK_INTERVAL_MS || 30000,
        CAMPAIGN_TICK_MS: process.env.CAMPAIGN_TICK_MS || 60000,
        COMMUNITY_TICK_MS: process.env.COMMUNITY_TICK_MS || 120000,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
