const path = require("node:path");
const { spawn } = require("node:child_process");
const { connectDB, createLogger } = require("../services/shared");
const { createOrdersApp } = require("../services/orders/src/index");
const { createPaymentsApp } = require("../services/payments/src/index");
const { createGatewayApp } = require("../services/gateway/src/index");

const logger = createLogger("cluster-launcher");

async function main() {
  process.env.SERVICE_VERSION = process.env.SERVICE_VERSION || "v1";
  process.env.GIT_COMMIT_SHA = process.env.GIT_COMMIT_SHA || "0bdb878";
  process.env.ORDERS_SERVICE_URL = "http://127.0.0.1:4001";
  process.env.PAYMENTS_SERVICE_URL = "http://127.0.0.1:4002";

  await connectDB(logger);

  // 1. Start Orders Microservice on :4001
  const ordersApp = createOrdersApp();
  const ordersServer = ordersApp.listen(4001, "127.0.0.1", () => {
    logger.info("Orders microservice listening on http://localhost:4001");
  });

  // 2. Start Payments Microservice on :4002
  const paymentsApp = createPaymentsApp();
  const paymentsServer = paymentsApp.listen(4002, "127.0.0.1", () => {
    logger.info("Payments microservice listening on http://localhost:4002");
  });

  // 3. Start API Gateway Microservice on :4000 (routing over HTTP to :4001 and :4002)
  const gatewayApp = createGatewayApp({ inProcess: false });
  const gatewayServer = gatewayApp.listen(4000, "127.0.0.1", () => {
    logger.info("Gateway microservice listening on http://localhost:4000");
  });

  // 4. Start Vite React Frontend on :5173
  const frontendDir = path.resolve(__dirname, "../frontend");
  const viteBin = path.resolve(__dirname, "../node_modules/vite/bin/vite.js");
  const viteProc = spawn(process.execPath, [viteBin, "--port", "5173", "--host", "127.0.0.1"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_API_TARGET: "http://127.0.0.1:4000",
    },
  });

  function shutdown() {
    viteProc.kill("SIGTERM");
    gatewayServer.close();
    ordersServer.close();
    paymentsServer.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
