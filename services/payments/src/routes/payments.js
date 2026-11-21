const express = require("express");
const {
  createPaymentRecord,
  recordPayment,
  setServiceHealth,
} = require("../../../shared");

const router = express.Router();

// Runtime fault state (used when judges inject live latency or service degradation without a code commit)
const runtimeFault = {
  mode: "healthy", // "healthy" | "latency" | "outage"
  latencyMs: 0,
  updatedAt: null,
};

function getPaymentFaultState() {
  return { ...runtimeFault };
}

function setPaymentFaultState(nextState = {}) {
  runtimeFault.mode = nextState.mode || "healthy";
  runtimeFault.latencyMs = Number(nextState.latencyMs || 0);
  runtimeFault.updatedAt = new Date().toISOString();
  setServiceHealth("payments", runtimeFault.mode !== "outage");
  return getPaymentFaultState();
}

router.post("/pay", async (req, res, next) => {
  try {
    if (runtimeFault.mode === "outage") {
      recordPayment("payments", "failed");
      const err = new Error("RUNTIME_FAULT: Payments gateway connection pool exhausted (simulated outage)");
      err.statusCode = 503;
      throw err;
    }

    if (runtimeFault.mode === "latency" && runtimeFault.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, runtimeFault.latencyMs));
    }

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

router.get("/fault", (_req, res) => {
  res.json(getPaymentFaultState());
});

router.post("/fault", (req, res) => {
  const state = setPaymentFaultState(req.body || {});
  res.json({ updated: true, fault: state });
});

module.exports = {
  paymentsRouter: router,
  getPaymentFaultState,
  setPaymentFaultState,
};
