const express = require("express");
const cors = require("cors");
const {
  createLogger,
  register,
  createTelemetryMiddleware,
  getTelemetrySummary,
  connectDB,
  getDbStatus,
  invokeExpressApp,
} = require("../../shared");
const { createOrdersApp } = require("../../orders/src/index");
const {
  getOrderFaultState,
  setOrderFaultState,
} = require("../../orders/src/routes/orders");
const { createPaymentsApp } = require("../../payments/src/index");
const {
  getPaymentFaultState,
  setPaymentFaultState,
} = require("../../payments/src/routes/payments");

const SERVICE_NAME = "gateway";
const logger = createLogger(SERVICE_NAME);

// Canary routing config (used when orders-v2 canary container is active)
const canaryConfig = {
  enabled: process.env.CANARY_ENABLED === "true",
  v2WeightPct: Number(process.env.CANARY_WEIGHT_PCT || 10), // 10% traffic to v2
  v1Hits: 0,
  v2Hits: 0,
};

function selectOrdersTargetUrl() {
  const v1Url = process.env.ORDERS_SERVICE_URL || "http://127.0.0.1:4001";
  const v2Url = process.env.ORDERS_CANARY_URL || "";

  if (canaryConfig.enabled && v2Url) {
    const roll = Math.random() * 100;
    if (roll < canaryConfig.v2WeightPct) {
      canaryConfig.v2Hits += 1;
      return { url: v2Url, targetVersion: "v2" };
    }
  }
  canaryConfig.v1Hits += 1;
  return { url: v1Url, targetVersion: "v1" };
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_e) {
      data = { raw: text };
    }
    return { status: res.status, ok: res.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

function createGatewayApp(options = {}) {
  const inProcess =
    options.inProcess !== undefined
      ? options.inProcess
      : process.env.IN_PROCESS_SERVICES === "true" || Boolean(process.env.VERCEL);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(createTelemetryMiddleware(SERVICE_NAME));

  // Mount in-process sub-apps under internal prefixes when running in serverless / single-process mode
  let localOrdersApp = null;
  let localPaymentsApp = null;
  if (inProcess) {
    localOrdersApp = createOrdersApp();
    localPaymentsApp = createPaymentsApp();
    app.use("/_internal/orders", localOrdersApp);
    app.use("/_internal/payments", localPaymentsApp);
  }

  // Helper to call either remote microservice container or local in-process router
  async function callService(service, method, path, body = null) {
    if (inProcess) {
      // Directly execute against in-process sub-app via ephemeral local loopback or direct handler
      const targetApp = service === "orders" ? localOrdersApp : localPaymentsApp;
      return invokeExpressApp(targetApp, method, path, body);
    }

    if (service === "orders") {
      const { url } = selectOrdersTargetUrl();
      try {
        return await fetchJsonWithTimeout(`${url}${path}`, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        const wrapped = new Error(`ORDERS_SERVICE_UNREACHABLE: Failed calling ${url}${path} (${err.message})`);
        wrapped.statusCode = 503;
        wrapped.serviceTarget = "orders";
        throw wrapped;
      }
    }

    const paymentsUrl = process.env.PAYMENTS_SERVICE_URL || "http://127.0.0.1:4002";
    try {
      return await fetchJsonWithTimeout(`${paymentsUrl}${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const wrapped = new Error(`PAYMENTS_SERVICE_UNREACHABLE: Failed calling ${paymentsUrl}${path} (${err.message})`);
      wrapped.statusCode = 503;
      wrapped.serviceTarget = "payments";
      throw wrapped;
    }
  }

  // Health probe
  app.get(["/health", "/api/health"], async (_req, res) => {
    let ordersHealth = { status: "down" };
    let paymentsHealth = { status: "down" };

    try {
      const oRes = await callService("orders", "GET", "/health");
      ordersHealth = oRes.data;
    } catch (e) {
      ordersHealth = { status: "unreachable", error: e.message };
    }

    try {
      const pRes = await callService("payments", "GET", "/health");
      paymentsHealth = pRes.data;
    } catch (e) {
      paymentsHealth = { status: "unreachable", error: e.message };
    }

    const allOk =
      ordersHealth.status === "ok" &&
      paymentsHealth.status === "ok";

    res.status(allOk ? 200 : 207).json({
      status: allOk ? "ok" : "degraded",
      service: SERVICE_NAME,
      mode: inProcess ? "serverless-unified" : "microservices-docker",
      version: process.env.SERVICE_VERSION || "v1",
      commit: process.env.GIT_COMMIT_SHA || "HEAD",
      canary: canaryConfig,
      services: {
        gateway: { status: "ok", version: process.env.SERVICE_VERSION || "v1" },
        orders: ordersHealth,
        payments: paymentsHealth,
      },
      db: getDbStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // Prometheus scrape endpoint
  app.get(["/metrics", "/api/metrics"], async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  // Aggregated telemetry & recent structured logs for the Storefront UI & SRE Agent
  app.get("/api/telemetry", async (_req, res) => {
    let ordersTelemetry = null;
    let paymentsTelemetry = null;
    try {
      const oRes = await callService("orders", "GET", "/telemetry");
      ordersTelemetry = oRes.data;
    } catch (e) {
      ordersTelemetry = { service: "orders", status: "unreachable", error: e.message };
    }

    try {
      const pRes = await callService("payments", "GET", "/telemetry");
      paymentsTelemetry = pRes.data;
    } catch (e) {
      paymentsTelemetry = { service: "payments", status: "unreachable", error: e.message };
    }

    res.json({
      gateway: getTelemetrySummary(SERVICE_NAME),
      orders: ordersTelemetry,
      payments: paymentsTelemetry,
      canary: canaryConfig,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/logs", async (req, res) => {
    const level = req.query.level;
    const combined = [...logger.getRecentLogs({ level })];

    try {
      const oLogs = await callService("orders", "GET", `/logs${level ? `?level=${level}` : ""}`);
      if (oLogs.data && Array.isArray(oLogs.data.logs)) {
        combined.push(...oLogs.data.logs);
      }
    } catch (_e) {
      // ignore if service is down
    }

    try {
      const pLogs = await callService("payments", "GET", `/logs${level ? `?level=${level}` : ""}`);
      if (pLogs.data && Array.isArray(pLogs.data.logs)) {
        combined.push(...pLogs.data.logs);
      }
    } catch (_e) {
      // ignore if service is down
    }

    combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
      count: combined.length,
      logs: combined.slice(0, 100),
    });
  });

  // Storefront Catalog
  app.get("/api/products", async (_req, res, next) => {
    try {
      const response = await callService("orders", "GET", "/products");
      res.status(response.status).json(response.data);
    } catch (err) {
      next(err);
    }
  });

  // Recent Orders Feed
  app.get("/api/orders", async (req, res, next) => {
    try {
      const limit = req.query.limit || 20;
      const response = await callService("orders", "GET", `/orders?limit=${limit}`);
      res.status(response.status).json(response.data);
    } catch (err) {
      next(err);
    }
  });

  // End-to-End Checkout Flow:
  // 1. Estimates amount from items
  // 2. Authorizes payment via Payments Service (POST /pay)
  // 3. Creates & persists order via Orders Service (POST /orders)
  app.post("/api/checkout", async (req, res, next) => {
    try {
      const {
        customerEmail = "developer@pulseshop.io",
        items = [],
        promoCode = null,
        discount = undefined,
        paymentMethod = "card_visa_4242",
      } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: "EMPTY_CART",
          message: "Please add at least one item to checkout.",
        });
      }

      const estimatedAmount = items.reduce(
        (sum, item) => sum + Number(item.unitPrice || 149) * Math.max(1, Number(item.quantity || 1)),
        0
      );

      // Step 1: Call Payments Microservice
      const payRes = await callService("payments", "POST", "/pay", {
        amount: Math.max(1, estimatedAmount),
        customerEmail,
        method: paymentMethod,
      });

      if (!payRes.ok) {
        logger.error("Checkout failed during payment authorization", {
          route: "POST /api/checkout",
          status: payRes.status,
          upstreamError: payRes.data,
        });
        return res.status(payRes.status).json({
          stage: "payments",
          ...payRes.data,
        });
      }

      // Step 2: Call Orders Microservice
      const orderRes = await callService("orders", "POST", "/orders", {
        customerEmail,
        items,
        promoCode,
        discount,
        paymentId: payRes.data.paymentId,
      });

      if (!orderRes.ok) {
        logger.error("Checkout failed during order persistence", {
          route: "POST /api/checkout",
          status: orderRes.status,
          upstreamError: orderRes.data,
        });
        return res.status(orderRes.status).json({
          stage: "orders",
          ...orderRes.data,
        });
      }

      return res.status(201).json({
        checkout: "success",
        payment: payRes.data,
        order: orderRes.data.order,
      });
    } catch (err) {
      next(err);
    }
  });

  // Live Chaos / Fault Control Endpoint (for Demo & Judges)
  app.get("/api/faults", async (_req, res) => {
    let ordersFault = getOrderFaultState();
    let paymentsFault = getPaymentFaultState();
    if (!inProcess) {
      try {
        const o = await callService("orders", "GET", "/fault");
        ordersFault = o.data;
      } catch (e) {
        ordersFault = { mode: "container_unreachable", error: e.message };
      }
      try {
        const p = await callService("payments", "GET", "/fault");
        paymentsFault = p.data;
      } catch (e) {
        paymentsFault = { mode: "container_unreachable", error: e.message };
      }
    }
    res.json({
      orders: ordersFault,
      payments: paymentsFault,
      canary: canaryConfig,
    });
  });

  app.post("/api/faults", async (req, res, next) => {
    try {
      const { target = "orders", mode = "healthy", latencyMs, resetStock = false, canary } = req.body || {};

      if (canary !== undefined) {
        if (canary.enabled !== undefined) canaryConfig.enabled = Boolean(canary.enabled);
        if (canary.v2WeightPct !== undefined) canaryConfig.v2WeightPct = Number(canary.v2WeightPct);
      }

      if (target === "reset-all") {
        if (inProcess) {
          setOrderFaultState({ mode: "healthy" });
          setPaymentFaultState({ mode: "healthy", latencyMs: 0 });
        } else {
          await callService("orders", "POST", "/fault", { mode: "healthy", resetStock: true }).catch(() => {});
          await callService("payments", "POST", "/fault", { mode: "healthy", latencyMs: 0 }).catch(() => {});
        }
        canaryConfig.enabled = false;
        logger.info("All fault states reset to healthy");
        return res.json({
          reset: true,
          orders: getOrderFaultState(),
          payments: getPaymentFaultState(),
          canary: canaryConfig,
        });
      }

      if (target === "payments") {
        const result = inProcess
          ? setPaymentFaultState({ mode, latencyMs })
          : (await callService("payments", "POST", "/fault", { mode, latencyMs })).data.fault;
        logger.warn(`Injected fault on payments service: ${mode}`, { target, mode, latencyMs });
        return res.json({ updated: true, target: "payments", fault: result });
      }

      const result = inProcess
        ? setOrderFaultState({ mode, latencyMs })
        : (await callService("orders", "POST", "/fault", { mode, latencyMs, resetStock })).data.fault;
      logger.warn(`Injected fault on orders service: ${mode}`, { target, mode, latencyMs });
      return res.json({ updated: true, target: "orders", fault: result });
    } catch (err) {
      next(err);
    }
  });

  // Centralized error handler
  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    const entry = logger.error(err.message || "Gateway unhandled exception", {
      error: err,
      method: req.method,
      route: req.originalUrl,
      status,
      serviceTarget: err.serviceTarget || SERVICE_NAME,
    });

    res.status(status).json({
      error: err.name || "GatewayError",
      message: err.message,
      service: err.serviceTarget || SERVICE_NAME,
      version: process.env.SERVICE_VERSION || "v1",
      commit: process.env.GIT_COMMIT_SHA || "HEAD",
      topFrame: entry.topFrame,
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 4000);
  connectDB(logger).then(() => {
    const app = createGatewayApp();
    app.listen(port, "0.0.0.0", () => {
      logger.info(`Gateway service listening on port ${port}`, { port });
    });
  });
}

module.exports = {
  createGatewayApp,
  logger,
};
