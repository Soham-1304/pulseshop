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
const MAX_SNAPSHOT_BUFFER = 200;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const PUSH_DEBOUNCE_MS = 30 * 1000;

const rollingWindow = {
  requests: [], // { ts, service, version, route, status, durationMs }
  ordersCreated: [], // { ts, version, orderId, amount }
  ordersFailed: [], // { ts, version, reason }
};

const telemetrySnapshots = [];
const lastPushByRule = new Map();
let peakOrdersPerMin = 0;

function pruneWindow(now = Date.now()) {
  const cutoff = now - SIX_HOURS_MS;
  rollingWindow.requests = rollingWindow.requests.filter((r) => r.ts >= cutoff);
  rollingWindow.ordersCreated = rollingWindow.ordersCreated.filter((o) => o.ts >= cutoff);
  rollingWindow.ordersFailed = rollingWindow.ordersFailed.filter((o) => o.ts >= cutoff);
  while (rollingWindow.requests.length > MAX_SNAPSHOT_BUFFER) rollingWindow.requests.shift();
  while (rollingWindow.ordersCreated.length > MAX_SNAPSHOT_BUFFER) rollingWindow.ordersCreated.shift();
  while (rollingWindow.ordersFailed.length > MAX_SNAPSHOT_BUFFER) rollingWindow.ordersFailed.shift();
}

function recordSnapshot(summary) {
  const now = Date.now();
  const cutoff = now - SIX_HOURS_MS;
  telemetrySnapshots.unshift(summary);
  while (telemetrySnapshots.length > 0) {
    const oldest = telemetrySnapshots[telemetrySnapshots.length - 1];
    const ts = Date.parse(oldest.timestamp);
    if ((Number.isFinite(ts) && ts < cutoff) || telemetrySnapshots.length > MAX_SNAPSHOT_BUFFER) {
      telemetrySnapshots.pop();
    } else {
      break;
    }
  }
}

function pushTelemetryIncident(serviceName, rule, severity, summary) {
  const webhookBase = process.env.PATCHUP_WEBHOOK_URL || process.env.AEGIS_WEBHOOK_URL;
  if (!webhookBase || typeof fetch !== "function") return;

  const now = Date.now();
  const key = `${serviceName}:${rule}`;
  const lastPush = lastPushByRule.get(key) || 0;
  if (now - lastPush < PUSH_DEBOUNCE_MS) return;
  lastPushByRule.set(key, now);

  const url = `${webhookBase.replace(/\/+$/, "")}/api/webhooks/incident-bundle`;
  const payload = {
    projectId: process.env.PATCHUP_PROJECT_ID || process.env.AEGIS_PROJECT_ID || "pulseshop",
    repo: process.env.GITHUB_REPO_FULL_NAME || "Soham-1304/pulseshop",
    serviceId: serviceName.endsWith("-service") ? serviceName : `${serviceName}-service`,
    service: serviceName,
    rule,
    severity,
    windowHours: 6,
    metrics: summary,
    snapshots: telemetrySnapshots.slice(0, 30),
    logs: [],
    timestamp: summary.timestamp,
  };

  try {
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }).catch(() => {});
  } catch (_err) {
    // Non-blocking reporter: never interrupt request handling
  }
}

function evaluateAndPushTelemetry(serviceName) {
  const summary = getTelemetrySummary(serviceName);
  recordSnapshot(summary);
  if (summary.ordersCreatedPerMin > peakOrdersPerMin) {
    peakOrdersPerMin = summary.ordersCreatedPerMin;
  }

  if (!process.env.PATCHUP_WEBHOOK_URL && !process.env.AEGIS_WEBHOOK_URL) return;

  if (summary.requestsPerMin >= 1 && summary.errorRatePct > 5) {
    pushTelemetryIncident(serviceName, "ERR_5XX_SPIKE", "CRITICAL", summary);
  }
  if (summary.requestsPerMin >= 1 && summary.p95LatencyMs > 400) {
    pushTelemetryIncident(serviceName, "LATENCY_P95_DOUBLE", "HIGH", summary);
  }
  const silentOrderDrop =
    (summary.ordersFailedPerMin > 0 && summary.ordersCreatedPerMin === 0) ||
    (peakOrdersPerMin >= 3 && summary.requestsPerMin >= 3 && summary.ordersCreatedPerMin === 0);
  if (silentOrderDrop) {
    pushTelemetryIncident(serviceName, "BIZ_ORDERS_DROP", "CRITICAL", summary);
  }
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
  evaluateAndPushTelemetry(serviceName);
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
      evaluateAndPushTelemetry(serviceName);
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
  getTelemetrySnapshots: () => telemetrySnapshots.slice(),
};
