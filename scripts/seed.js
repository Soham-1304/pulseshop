const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const {
  connectDB,
  ProductModel,
  OrderModel,
  INITIAL_PRODUCTS,
  createLogger,
} = require("../services/shared");

const logger = createLogger("seed");

async function run() {
  const status = await connectDB(logger);
  if (status.mode !== "mongodb") {
    throw new Error("Could not connect to MongoDB Atlas. Check IP Network Access allowlist (0.0.0.0/0).");
  }

  await ProductModel.deleteMany({});
  await ProductModel.insertMany(INITIAL_PRODUCTS);

  const existingOrders = await OrderModel.countDocuments();
  if (existingOrders === 0) {
    await OrderModel.insertMany([
      {
        orderId: "ORD-99201",
        customerEmail: "aarav.mehta@gmail.com",
        items: [
          {
            sku: "PS-KB-01",
            name: "Keychron Q1 Pro Wireless Custom Mechanical Keyboard",
            quantity: 1,
            unitPrice: 199.0,
          },
        ],
        subtotal: 199.0,
        discountAmount: 0,
        totalAmount: 199.0,
        promoCode: null,
        paymentId: "PAY-88101",
        paymentStatus: "AUTHORIZED",
        status: "CONFIRMED",
        serviceVersion: "v1",
        commitSha: "024201f",
      },
      {
        orderId: "ORD-99202",
        customerEmail: "priya.sharma@outlook.com",
        items: [
          {
            sku: "PS-DK-03",
            name: "CalDigit TS4 Thunderbolt 4 18-Port Workstation Dock",
            quantity: 1,
            unitPrice: 379.0,
          },
        ],
        subtotal: 379.0,
        discountAmount: 0,
        totalAmount: 379.0,
        promoCode: null,
        paymentId: "PAY-88102",
        paymentStatus: "AUTHORIZED",
        status: "CONFIRMED",
        serviceVersion: "v1",
        commitSha: "024201f",
      },
    ]);
  }

  const productCount = await ProductModel.countDocuments();
  const orderCount = await OrderModel.countDocuments();
  logger.info("MongoDB Atlas seeded successfully", { productCount, orderCount });
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed error:", err.message);
  process.exit(1);
});
