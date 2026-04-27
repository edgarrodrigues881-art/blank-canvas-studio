import "dotenv/config";
import express from "express";
import { logger, createLogger } from "./utils/logger.js";
import { getSupabase } from "./services/supabase.js";
import healthRouter from "./routes/health.js";
import { registerCronJobs } from "./cron/index.js";

const log = createLogger("server");
const app = express();

// JSON middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (lightweight)
app.use((req, _res, next) => {
  log.debug({ method: req.method, path: req.path }, "incoming request");
  next();
});

// Routes
app.use("/", healthRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

// Error handler
app.use((err, _req, res, _next) => {
  log.error(
    { err: { message: err?.message, stack: err?.stack } },
    "unhandled error",
  );
  res.status(500).json({ error: "internal_error", message: err?.message });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  log.info(`🚀 vps-backend listening on port ${PORT}`);
  log.info(`   Health:  http://localhost:${PORT}/health`);
  log.info(`   Base URL: ${process.env.VPS_BASE_URL || `http://localhost:${PORT}`}`);

  // Initialize Supabase (logs warning if env vars missing)
  getSupabase();

  // Register all cron jobs
  registerCronJobs();
});

// Graceful shutdown
const shutdown = (signal) => {
  log.info(`Received ${signal}, shutting down`);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err: { message: err?.message, stack: err?.stack } }, "uncaughtException");
  process.exit(1);
});
