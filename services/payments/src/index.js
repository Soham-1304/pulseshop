const express = require("express");
const cors = require("cors");
const {
  createLogger,
  register,
  createTelemetryMiddleware,
  getTelemetrySummary,
  connectDB,
  getDbStatus,
} = require("../../shared");
const {
  paymentsRouter,
  getPaymentFaultState,
} = require("./routes/payments");

const SERVICE_NAME = "payments";
const logger = createLogger(SERVICE_NAME);

function createPaymentsApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createTelemetryMiddleware(SERVICE_NAME));

  app.get("/health", (_req, res) => {
    const fault = getPaymentFaultState();
    const isHealthy = fault.mode !== "outage";
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "degraded",
      service: SERVICE_NAME,
      version: process.env.SERVICE_VERSION || "v1",
      commit: process.env.GIT_COMMIT_SHA || "HEAD",
      fault,
      db: getDbStatus(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  app.get("/telemetry", (_req, res) => {
    res.json({
      ...getTelemetrySummary(SERVICE_NAME),
      fault: getPaymentFaultState(),
    });
  });

  app.get("/logs", (req, res) => {
    res.json({
      service: SERVICE_NAME,
      logs: logger.getRecentLogs({ level: req.query.level }),
    });
  });

  app.use("/", paymentsRouter);

  // Centralized structured JSON error handler
  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    const logEntry = logger.error(err.message || "Unhandled error in payments service", {
      error: err,
      method: req.method,
      route: req.originalUrl,
      status,
    });

    res.status(status).json({
      error: err.name || "InternalServerError",
      message: err.message,
      service: SERVICE_NAME,
      version: process.env.SERVICE_VERSION || "v1",
      commit: process.env.GIT_COMMIT_SHA || "HEAD",
      topFrame: logEntry.topFrame,
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PAYMENTS_PORT || process.env.PORT || 4002);
  connectDB(logger).then(() => {
    const app = createPaymentsApp();
    app.listen(port, "0.0.0.0", () => {
      logger.info(`Payments service listening on port ${port}`, { port });
    });
  });
}

module.exports = {
  createPaymentsApp,
  logger,
};
