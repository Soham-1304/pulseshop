const client = require("prom-client");

// Single shared registry per service process
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "pulseshop_node_" });

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests processed",
  labelNames: ["service", "version", "method", "route", "status"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["service", "version", "method", "route", "status"],
  buckets: [0.005, 0.015, 0.03, 0.06, 0.12, 0.25, 0.5, 1.0, 2.5, 5.0],
  registers: [register],
});

const shopOrdersCreatedTotal = new client.Counter({
  name: "shop_orders_created_total",
  help: "Total number of customer orders persisted to database",
  labelNames: ["service", "version"],
  registers: [register],
});

const shopOrdersFailedTotal = new client.Counter({
  name: "shop_orders_failed_total",
  help: "Total number of failed checkout/order attempts",
  labelNames: ["service", "version", "reason"],
  registers: [register],
});

const shopPaymentTransactionsTotal = new client.Counter({
  name: "shop_payment_transactions_total",
  help: "Total number of payment authorization attempts",
  labelNames: ["service", "version", "status"],
  registers: [register],
});

const shopServiceHealthStatus = new client.Gauge({
  name: "shop_service_health_status",
  help: "1 if service is healthy, 0 if degraded or fault-injected",
  labelNames: ["service", "version"],
  registers: [register],
});

// In-memory rolling window snapshot so the UI & SRE Agent can also inspect JSON summary metrics
const rollingWindow = {
  requests: [], // { ts, service, version, route, status, durationMs }
  ordersCreated: [], // { ts, version, orderId, amount }
  ordersFailed: [], // { ts, version, reason }
};

function pruneWindow(now = Date.now()) {
  const cutoff = now - 5 * 60 * 1000; // last 5 minutes
  rollingWindow.requests = rollingWindow.requests.filter((r) => r.ts >= cutoff);
  rollingWindow.ordersCreated = rollingWindow.ordersCreated.filter((o) => o.ts >= cutoff);
  rollingWindow.ordersFailed = rollingWindow.ordersFailed.filter((o) => o.ts >= cutoff);
}

function recordOrderCreated(serviceName, orderId, amount) {
  const version = process.env.SERVICE_VERSION || "v1";
  shopOrdersCreatedTotal.inc({ service: serviceName, version });
  pruneWindow();
  rollingWindow.ordersCreated.push({ ts: Date.now(), version, orderId, amount });
}

function recordOrderFailed(serviceName, reason = "exception") {
  const version = process.env.SERVICE_VERSION || "v1";
  shopOrdersFailedTotal.inc({ service: serviceName, version, reason });
  pruneWindow();
  rollingWindow.ordersFailed.push({ ts: Date.now(), version, reason });
}

function recordPayment(serviceName, status = "authorized") {
  const version = process.env.SERVICE_VERSION || "v1";
  shopPaymentTransactionsTotal.inc({ service: serviceName, version, status });
}

function setServiceHealth(serviceName, isHealthy) {
  const version = process.env.SERVICE_VERSION || "v1";
  shopServiceHealthStatus.set({ service: serviceName, version }, isHealthy ? 1 : 0);
}

function getTelemetrySummary(serviceName) {
  const now = Date.now();
  pruneWindow(now);
  const oneMinAgo = now - 60 * 1000;
  const recentReqs = rollingWindow.requests.filter((r) => r.ts >= oneMinAgo);
  const totalReqs1m = recentReqs.length;
  const errorReqs1m = recentReqs.filter((r) => r.status >= 500).length;
  const errorRatePct = totalReqs1m > 0 ? Number(((errorReqs1m / totalReqs1m) * 100).toFixed(2)) : 0;

  const durations = recentReqs.map((r) => r.durationMs).sort((a, b) => a - b);
  const p95LatencyMs =
    durations.length > 0
      ? Number(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))].toFixed(1))
      : 12.0;

  const orders1m = rollingWindow.ordersCreated.filter((o) => o.ts >= oneMinAgo).length;
  const failedOrders1m = rollingWindow.ordersFailed.filter((o) => o.ts >= oneMinAgo).length;

  return {
    service: serviceName,
    version: process.env.SERVICE_VERSION || "v1",
    commit: process.env.GIT_COMMIT_SHA || "HEAD",
    windowSeconds: 60,
    requestsPerMin: totalReqs1m,
    errors5xxPerMin: errorReqs1m,
    errorRatePct,
    p95LatencyMs,
    ordersCreatedPerMin: orders1m,
    ordersFailedPerMin: failedOrders1m,
    timestamp: new Date(now).toISOString(),
  };
}

function createTelemetryMiddleware(serviceName) {
  const version = process.env.SERVICE_VERSION || "v1";
  setServiceHealth(serviceName, true);

  return function telemetryMiddleware(req, res, next) {
    if (req.path === "/metrics" || req.path === "/health") {
      return next();
    }

    const startNs = process.hrtime.bigint();

    res.on("finish", () => {
      const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;
      const durationMs = durationSec * 1000;
      const route = req.route && req.route.path ? req.baseUrl + req.route.path : req.path;
      const status = String(res.statusCode);

      httpRequestsTotal.inc({
        service: serviceName,
        version,
        method: req.method,
        route,
        status,
      });

      httpRequestDurationSeconds.observe(
        {
          service: serviceName,
          version,
          method: req.method,
          route,
          status,
        },
        durationSec
      );

      pruneWindow();
      rollingWindow.requests.push({
        ts: Date.now(),
        service: serviceName,
        version,
        route,
        status: res.statusCode,
        durationMs,
      });
    });

    next();
  };
}

module.exports = {
  register,
  createTelemetryMiddleware,
  recordOrderCreated,
  recordOrderFailed,
  recordPayment,
  setServiceHealth,
  getTelemetrySummary,
};
