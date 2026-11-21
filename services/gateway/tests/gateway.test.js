const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeExpressApp } = require("../../shared");
const { createGatewayApp } = require("../src/index");

test("Gateway Service - End-to-end checkout and fault simulation", async () => {
  process.env.USE_MEMORY_DB = "true";
  const app = createGatewayApp({ inProcess: true });

  // 1. Reset all faults to healthy
  await invokeExpressApp(app, "POST", "/api/faults", { target: "reset-all" });

  // 2. Aggregated health check
  const health = await invokeExpressApp(app, "GET", "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");

  // 3. Complete checkout
  const checkout = await invokeExpressApp(app, "POST", "/api/checkout", {
    customerEmail: "engineer@pulseshop.io",
    items: [{ sku: "PS-KB-01", quantity: 1, unitPrice: 199.0 }],
    promoCode: "PULSE10",
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.checkout, "success");
  assert.equal(checkout.data.order.totalAmount, 179.1);

  // 4. Simulate bug-checkout fault and confirm 500 with topFrame stack trace for git blame
  await invokeExpressApp(app, "POST", "/api/faults", {
    target: "orders",
    mode: "bug-checkout",
  });

  const brokenCheckout = await invokeExpressApp(app, "POST", "/api/checkout", {
    customerEmail: "engineer@pulseshop.io",
    items: [{ sku: "PS-KB-01", quantity: 1, unitPrice: 199.0 }],
  });
  assert.equal(brokenCheckout.status, 500);
  assert.ok(brokenCheckout.data.topFrame);
  assert.equal(brokenCheckout.data.topFrame.file, "services/orders/src/routes/orders.js");

  // 5. Verify Prometheus /metrics exposition format
  const metricsRes = await invokeExpressApp(app, "GET", "/metrics");
  assert.equal(metricsRes.status, 200);
  assert.ok(String(metricsRes.data).includes("shop_orders_created_total"));

  // 6. Restore healthy state
  await invokeExpressApp(app, "POST", "/api/faults", { target: "reset-all" });
});
