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
  ordersRouter,
  getOrderFaultState,
} = require("./routes/orders");

const SERVICE_NAME = "orders";
const logger = createLogger(SERVICE_NAME);

function createOrdersApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createTelemetryMiddleware(SERVICE_NAME));

  app.get("/health", (_req, res) => {
    const fault = getOrderFaultState();
    res.status(200).json({
      status: fault.mode === "healthy" ? "ok" : "fault_active",
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
      fault: getOrderFaultState(),
    });
  });

  app.get("/logs", (req, res) => {
    res.json({
      service: SERVICE_NAME,
      logs: logger.getRecentLogs({ level: req.query.level }),
    });
  });

  app.use("/", ordersRouter);

  // Structured JSON error handler with stack trace extraction for git blame
  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    const logEntry = logger.error(err.message || "Unhandled error in orders service", {
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
  const port = Number(process.env.ORDERS_PORT || process.env.PORT || 4001);
  connectDB(logger).then(() => {
    const app = createOrdersApp();
    app.listen(port, "0.0.0.0", () => {
      logger.info(`Orders service listening on port ${port}`, { port });
    });
  });
}

module.exports = {
  createOrdersApp,
  logger,
};
