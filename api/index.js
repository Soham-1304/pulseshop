const { connectDB } = require("../services/shared");
const { createGatewayApp, logger } = require("../services/gateway/src/index");

let cachedApp = null;

module.exports = async function handler(req, res) {
  if (!cachedApp) {
    await connectDB(logger);
    cachedApp = createGatewayApp({ inProcess: true });
  }
  return cachedApp(req, res);
};
