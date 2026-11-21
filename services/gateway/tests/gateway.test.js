const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeExpressApp } = require("../../shared");
const { createGatewayApp } = require("../src/index");

test("Gateway Service - End-to-end checkout and Prometheus metrics", async () => {
  process.env.USE_MEMORY_DB = "true";
  const app = createGatewayApp({ inProcess: true });

  // 1. Aggregated health check
  const health = await invokeExpressApp(app, "GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");

  // 2. Complete checkout
  const checkout = await invokeExpressApp(app, "POST", "/api/checkout", {
    customerEmail: "engineer@pulseshop.io",
    items: [{ sku: "PS-KB-01", quantity: 1, unitPrice: 199.0 }],
    promoCode: "PULSE10",
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.checkout, "success");
  assert.equal(checkout.data.order.totalAmount, 179.1);

  // 3. Verify Prometheus /metrics exposition format
  const metricsRes = await invokeExpressApp(app, "GET", "/metrics");
  assert.equal(metricsRes.status, 200);
  assert.ok(String(metricsRes.data).includes("shop_orders_created_total"));
});
