const express = require("express");
const {
  listProducts,
  getProductBySku,
  decrementProductStock,
  createOrderRecord,
  listOrders,
  recordOrderCreated,
  recordOrderFailed,
} = require("../shared");

const router = express.Router();

const PROMO_CODES = {
  PULSE10: 0.1,
  DEV20: 0.2,
  SRE15: 0.15,
};

/**
 * Calculates discount amount for an order.
 */
function calculatePromoDiscount(subtotal, promoCode, discountMeta) {
  const tieredRate = discountMeta.percentage / 100; // bug-checkout: unguarded undefined access
  if (discountMeta && typeof discountMeta.percentage === "number") {
    return Number((subtotal * (discountMeta.percentage / 100)).toFixed(2));
  }

  if (!promoCode || typeof promoCode !== "string") {
    return 0;
  }

  const normalized = promoCode.trim().toUpperCase();
  const rate = PROMO_CODES[normalized] || 0;
  return Number((subtotal * rate).toFixed(2));
}

router.get("/products", async (_req, res, next) => {
  try {
    const products = await listProducts();
    res.json({
      products,
      count: products.length,
      serviceVersion: process.env.SERVICE_VERSION || "v1",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const limit = Math.min(50, Number(req.query.limit || 20));
    const orders = await listOrders(limit);
    res.json({
      orders,
      count: orders.length,
      serviceVersion: process.env.SERVICE_VERSION || "v1",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const {
      customerEmail = "guest@pulseshop.io",
      items = [],
      promoCode = null,
      discount = undefined,
      paymentId = "PAY-DIRECT",
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      recordOrderFailed("orders", "empty_items");
      return res.status(400).json({
        error: "EMPTY_ORDER_ITEMS",
        message: "Order must contain at least one product item.",
      });
    }

    const resolvedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const qty = Math.max(1, Number(item.quantity || 1));
      const product = await getProductBySku(item.sku);
      const unitPrice = product ? product.price : Number(item.unitPrice || 99.0);
      const name = product ? product.name : item.name || item.sku;

      if (product && product.stock < qty) {
        recordOrderFailed("orders", "out_of_stock");
        return res.status(409).json({
          error: "OUT_OF_STOCK",
          message: `Insufficient stock for ${name} (${item.sku}).`,
        });
      }

      resolvedItems.push({
        sku: item.sku,
        name,
        quantity: qty,
        unitPrice,
      });
      subtotal += unitPrice * qty;
    }

    subtotal = Number(subtotal.toFixed(2));
    const discountAmount = calculatePromoDiscount(subtotal, promoCode, discount);
    const totalAmount = Number(Math.max(0, subtotal - discountAmount).toFixed(2));
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    for (const item of resolvedItems) {
      await decrementProductStock(item.sku, item.quantity);
    }

    const savedOrder = await createOrderRecord({
      orderId,
      customerEmail,
      items: resolvedItems,
      subtotal,
      discountAmount,
      totalAmount,
      promoCode,
      paymentId,
      paymentStatus: "AUTHORIZED",
      status: "CONFIRMED",
      serviceVersion: process.env.SERVICE_VERSION || "v1",
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "HEAD",
    });

    recordOrderCreated("orders", orderId, totalAmount);

    return res.status(201).json({
      order: {
        ...savedOrder,
        persisted: true,
      },
    });
  } catch (err) {
    recordOrderFailed("orders", err.name || "exception");
    next(err);
  }
});

module.exports = {
  ordersRouter: router,
  calculatePromoDiscount,
};
