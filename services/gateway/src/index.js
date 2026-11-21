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
const { createPaymentsApp } = require("../../payments/src/index");

const SERVICE_NAME = "gateway";
const logger = createLogger(SERVICE_NAME);

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

  let localOrdersApp = null;
  let localPaymentsApp = null;
  if (inProcess) {
    localOrdersApp = createOrdersApp();
    localPaymentsApp = createPaymentsApp();
    app.use("/_internal/orders", localOrdersApp);
    app.use("/_internal/payments", localPaymentsApp);
  }

  async function callService(service, method, path, body = null) {
    if (inProcess) {
      const targetApp = service === "orders" ? localOrdersApp : localPaymentsApp;
      return invokeExpressApp(targetApp, method, path, body);
    }

    if (service === "orders") {
      const ordersUrl = process.env.ORDERS_SERVICE_URL || "http://127.0.0.1:4001";
      try {
        return await fetchJsonWithTimeout(`${ordersUrl}${path}`, {
          method,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        const wrapped = new Error(`ORDERS_SERVICE_UNREACHABLE: Failed calling ${ordersUrl}${path} (${err.message})`);
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

    const allOk = ordersHealth.status === "ok" && paymentsHealth.status === "ok";

    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ok" : "degraded",
      service: SERVICE_NAME,
      mode: inProcess ? "serverless-unified" : "microservices-docker",
      version: process.env.SERVICE_VERSION || "v1",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "HEAD",
      services: {
        gateway: { status: "ok", version: process.env.SERVICE_VERSION || "v1" },
        orders: ordersHealth,
        payments: paymentsHealth,
      },
      db: getDbStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get(["/metrics", "/api/metrics"], async (_req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

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

  app.get("/api/products", async (_req, res, next) => {
    try {
      const response = await callService("orders", "GET", "/products");
      res.status(response.status).json(response.data);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/orders", async (req, res, next) => {
    try {
      const limit = req.query.limit || 20;
      const response = await callService("orders", "GET", `/orders?limit=${limit}`);
      res.status(response.status).json(response.data);
    } catch (err) {
      next(err);
    }
  });

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

      // Step 1: Authorize payment via Payments Microservice
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

      // Step 2: Persist order via Orders Microservice
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
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "HEAD",
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
