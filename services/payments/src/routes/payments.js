const express = require("express");
const {
  createPaymentRecord,
  recordPayment,
} = require("../shared");

const router = express.Router();

router.post("/pay", async (req, res, next) => {
  try {
    const { amount, currency = "USD", customerEmail, method = "card_visa_4242", orderReference } = req.body || {};

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      recordPayment("payments", "rejected");
      return res.status(400).json({
        error: "INVALID_PAYMENT_AMOUNT",
        message: "Payment amount must be a positive number.",
      });
    }

    if (!customerEmail || typeof customerEmail !== "string") {
      recordPayment("payments", "rejected");
      return res.status(400).json({
        error: "MISSING_CUSTOMER_EMAIL",
        message: "Customer email is required for payment authorization.",
      });
    }

    const paymentId = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    const record = await createPaymentRecord({
      paymentId,
      orderReference: orderReference || null,
      amount: Number(numericAmount.toFixed(2)),
      currency,
      method,
      status: "AUTHORIZED",
      serviceVersion: process.env.SERVICE_VERSION || "v1",
    });

    recordPayment("payments", "authorized");
    return res.status(200).json({
      authorized: true,
      paymentId: record.paymentId,
      amount: record.amount,
      currency: record.currency,
      status: record.status,
      serviceVersion: record.serviceVersion,
      timestamp: record.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = {
  paymentsRouter: router,
};
