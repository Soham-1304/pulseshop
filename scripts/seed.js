const { connectDB, resetStore, createLogger } = require("../services/shared");

const logger = createLogger("seed");

async function run() {
  await connectDB(logger);
  await resetStore();
  logger.info("PulseShop product catalog seeded and stock counts reset.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
