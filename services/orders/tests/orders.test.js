const test = require("node:test");
const assert = require("node:assert/strict");
const { invokeExpressApp } = require("../../shared");
const { createOrdersApp } = require("../src/index");
const { setOrderFaultState } = require("../src/routes/orders");

test("Orders Service - Catalog listing and checkout without promo/discount metadata", async () => {
  process.env.USE_MEMORY_DB = "true";
  setOrderFaultState({ mode: "healthy" });
  const app = createOrdersApp();

  // 1. Catalog check
  const catalog = await invokeExpressApp(app, "GET", "/products");
  assert.equal(catalog.status, 200);
  assert.ok(Array.isArray(catalog.data.products));
  assert.ok(catalog.data.products.length >= 6);

  // 2. Standard checkout without discount object (regression test for bug-checkout)
  const createRes = await invokeExpressApp(app, "POST", "/orders", {
    customerEmail: "buyer@pulseshop.io",
    items: [{ sku: "PS-KB-01", quantity: 1 }],
    promoCode: null,
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.data.order.status, "CONFIRMED");
  assert.equal(createRes.data.order.totalAmount, 199.0);
  assert.equal(createRes.data.order.persisted, true);

  // 3. Checkout with valid promo code PULSE10 (10% off)
  const promoRes = await invokeExpressApp(app, "POST", "/orders", {
    customerEmail: "promo@pulseshop.io",
    items: [{ sku: "PS-MS-05", quantity: 2 }], // 2 * 99 = 198
    promoCode: "PULSE10",
  });
  assert.equal(promoRes.status, 201);
  assert.equal(promoRes.data.order.subtotal, 198.0);
  assert.equal(promoRes.data.order.discountAmount, 19.8);
  assert.equal(promoRes.data.order.totalAmount, 178.2);
});
