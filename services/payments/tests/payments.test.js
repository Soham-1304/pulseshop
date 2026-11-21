const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeExpressApp } = require("../../shared");
const { createPaymentsApp } = require("../src/index");
const { setPaymentFaultState } = require("../src/routes/payments");

test("Payments Service - Health check and payment authorization", async () => {
  process.env.USE_MEMORY_DB = "true";
  setPaymentFaultState({ mode: "healthy", latencyMs: 0 });
  const app = createPaymentsApp();

  const health = await invokeExpressApp(app, "GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.status, "ok");
  assert.equal(health.data.service, "payments");

  const validPay = await invokeExpressApp(app, "POST", "/pay", {
    amount: 199.0,
    customerEmail: "dev@pulseshop.io",
    method: "card_visa_4242",
  });
  assert.equal(validPay.status, 200);
  assert.equal(validPay.data.authorized, true);
  assert.ok(validPay.data.paymentId.startsWith("PAY-"));

  const invalidPay = await invokeExpressApp(app, "POST", "/pay", {
    amount: -10,
    customerEmail: "dev@pulseshop.io",
  });
  assert.equal(invalidPay.status, 400);
  assert.equal(invalidPay.data.error, "INVALID_PAYMENT_AMOUNT");
});
