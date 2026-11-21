const mongoose = require("mongoose");

const INITIAL_PRODUCTS = [
  {
    sku: "PS-KB-01",
    name: "Keychron Q1 Pro Wireless Custom Mechanical Keyboard",
    category: "Peripherals",
    price: 199.0,
    stock: 42,
    rating: 4.9,
    badge: "Bestseller",
    description: "CNC machined aluminum body, QMK/VIA programmable, hot-swappable tactile switches.",
  },
  {
    sku: "PS-MN-02",
    name: "ProDisplay 34\" WQHD 165Hz Curved OLED Monitor",
    category: "Displays",
    price: 749.0,
    stock: 18,
    rating: 4.8,
    badge: "Low Latency",
    description: "0.03ms GtG response time, 99% DCI-P3 color gamut, integrated 90W USB-C KVM.",
  },
  {
    sku: "PS-DK-03",
    name: "CalDigit TS4 Thunderbolt 4 18-Port Workstation Dock",
    category: "Connectivity",
    price: 379.0,
    stock: 31,
    rating: 4.9,
    badge: "Pro Gear",
    description: "98W power delivery, 2.5GbE Ethernet, dual 6K 60Hz display output, UHS-II SD.",
  },
  {
    sku: "PS-AU-04",
    name: "Audeze Maxwell Planar Magnetic Studio Headset",
    category: "Audio",
    price: 299.0,
    stock: 25,
    rating: 4.7,
    badge: "Studio Grade",
    description: "90mm planar magnetic drivers, ultra-low latency wireless dongle, AI noise filter mic.",
  },
  {
    sku: "PS-MS-05",
    name: "MX Master 3S Ultra-Fast MagSpeed Ergonomic Mouse",
    category: "Peripherals",
    price: 99.0,
    stock: 64,
    rating: 4.8,
    badge: "Essential",
    description: "8K DPI optical sensor tracks on glass, quiet tactile clicks, multi-device flow.",
  },
  {
    sku: "PS-ST-06",
    name: "NVMe Gen5 2TB M.2 12,400MB/s Heatsink SSD",
    category: "Storage",
    price: 229.0,
    stock: 50,
    rating: 4.9,
    badge: "Gen5 Speed",
    description: "PCIe 5.0 x4 controller with LPDDR4 DRAM cache and low-profile graphene cooler.",
  },
];

// Mongoose Schemas
const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 10 },
    rating: { type: Number, default: 4.8 },
    badge: { type: String, default: "Featured" },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customerEmail: { type: String, required: true },
    items: [
      {
        sku: String,
        name: String,
        quantity: Number,
        unitPrice: Number,
      },
    ],
    subtotal: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    promoCode: { type: String, default: null },
    paymentId: { type: String, required: true },
    paymentStatus: { type: String, default: "AUTHORIZED" },
    status: { type: String, default: "CONFIRMED" },
    serviceVersion: { type: String, default: "v1" },
    commitSha: { type: String, default: "HEAD" },
  },
  { timestamps: true }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true },
    orderReference: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    method: { type: String, default: "card_visa_4242" },
    status: { type: String, default: "AUTHORIZED" },
    serviceVersion: { type: String, default: "v1" },
  },
  { timestamps: true }
);

const ProductModel = mongoose.models.Product || mongoose.model("Product", productSchema);
const OrderModel = mongoose.models.Order || mongoose.model("Order", orderSchema);
const PaymentModel = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

// In-memory store fallback when MongoDB is not running (e.g. unit tests / instant serverless preview)
const memoryStore = {
  mode: "memory", // "mongodb" | "memory"
  products: INITIAL_PRODUCTS.map((p) => ({ ...p })),
  orders: [
    {
      orderId: "ORD-99201",
      customerEmail: "alex.dev@pulseshop.io",
      items: [{ sku: "PS-KB-01", name: "Keychron Q1 Pro Wireless Custom Mechanical Keyboard", quantity: 1, unitPrice: 199.0 }],
      subtotal: 199.0,
      discountAmount: 0,
      totalAmount: 199.0,
      promoCode: null,
      paymentId: "PAY-88101",
      paymentStatus: "AUTHORIZED",
      status: "CONFIRMED",
      serviceVersion: "v1",
      commitSha: "main-initial",
      createdAt: new Date(Date.now() - 180 * 1000).toISOString(),
    },
    {
      orderId: "ORD-99202",
      customerEmail: "sre.lead@pulseshop.io",
      items: [{ sku: "PS-DK-03", name: "CalDigit TS4 Thunderbolt 4 18-Port Workstation Dock", quantity: 1, unitPrice: 379.0 }],
      subtotal: 379.0,
      discountAmount: 0,
      totalAmount: 379.0,
      promoCode: null,
      paymentId: "PAY-88102",
      paymentStatus: "AUTHORIZED",
      status: "CONFIRMED",
      serviceVersion: "v1",
      commitSha: "main-initial",
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  ],
  payments: [],
};

let connectionAttempted = false;

async function connectDB(logger) {
  const uri = process.env.MONGODB_URI;
  if (!uri || process.env.USE_MEMORY_DB === "true") {
    memoryStore.mode = "memory";
    return { mode: "memory", connected: true };
  }

  if (mongoose.connection.readyState === 1) {
    memoryStore.mode = "mongodb";
    return { mode: "mongodb", connected: true };
  }

  if (connectionAttempted && memoryStore.mode === "memory") {
    return { mode: "memory", connected: true };
  }

  connectionAttempted = true;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500,
    });
    memoryStore.mode = "mongodb";

    // Seed initial catalog if empty
    const count = await ProductModel.countDocuments();
    if (count === 0) {
      await ProductModel.insertMany(INITIAL_PRODUCTS);
    }
    if (logger) {
      logger.info("Connected to MongoDB and verified product catalog", { mode: "mongodb" });
    }
    return { mode: "mongodb", connected: true };
  } catch (err) {
    memoryStore.mode = "memory";
    if (logger) {
      logger.warn("MongoDB unreachable; running with synchronized in-memory store fallback", {
        reason: err.message,
      });
    }
    return { mode: "memory", connected: true };
  }
}

async function listProducts() {
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    return ProductModel.find().sort({ sku: 1 }).lean();
  }
  return memoryStore.products;
}

async function getProductBySku(sku) {
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    return ProductModel.findOne({ sku }).lean();
  }
  return memoryStore.products.find((p) => p.sku === sku) || null;
}

async function decrementProductStock(sku, qty) {
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    return ProductModel.findOneAndUpdate({ sku }, { $inc: { stock: -qty } }, { new: true }).lean();
  }
  const prod = memoryStore.products.find((p) => p.sku === sku);
  if (prod) {
    prod.stock = Math.max(0, prod.stock - qty);
  }
  return prod;
}

async function createOrderRecord(orderData) {
  const record = {
    ...orderData,
    createdAt: new Date().toISOString(),
  };
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    const doc = await OrderModel.create(record);
    return doc.toObject();
  }
  memoryStore.orders.unshift(record);
  if (memoryStore.orders.length > 100) {
    memoryStore.orders.pop();
  }
  return record;
}

async function listOrders(limit = 25) {
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    return OrderModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
  return memoryStore.orders.slice(0, limit);
}

async function createPaymentRecord(paymentData) {
  const record = {
    ...paymentData,
    createdAt: new Date().toISOString(),
  };
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    const doc = await PaymentModel.create(record);
    return doc.toObject();
  }
  memoryStore.payments.unshift(record);
  if (memoryStore.payments.length > 100) {
    memoryStore.payments.pop();
  }
  return record;
}

async function resetStore() {
  memoryStore.products = INITIAL_PRODUCTS.map((p) => ({ ...p }));
  if (memoryStore.mode === "mongodb" && mongoose.connection.readyState === 1) {
    await ProductModel.deleteMany({});
    await ProductModel.insertMany(INITIAL_PRODUCTS);
  }
}

function getDbStatus() {
  return {
    mode: memoryStore.mode,
    mongoConnected: mongoose.connection.readyState === 1,
    productsCount: memoryStore.products.length,
    ordersCount: memoryStore.orders.length,
  };
}

module.exports = {
  INITIAL_PRODUCTS,
  ProductModel,
  OrderModel,
  PaymentModel,
  connectDB,
  listProducts,
  getProductBySku,
  decrementProductStock,
  createOrderRecord,
  listOrders,
  createPaymentRecord,
  resetStore,
  getDbStatus,
};
