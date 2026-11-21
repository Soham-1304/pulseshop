const { connectDB } = require("../src/shared");
const { createGatewayApp, logger } = require("../src/index");

let appInstance = null;

module.exports = async function handler(req, res) {
  if (!appInstance) {
    await connectDB(logger);
    appInstance = createGatewayApp();
  }
  return appInstance(req, res);
};
