const { connectDB } = require("../src/shared");
const { createOrdersApp, logger } = require("../src/index");

let appInstance = null;

module.exports = async function handler(req, res) {
  if (!appInstance) {
    await connectDB(logger);
    appInstance = createOrdersApp();
  }
  return appInstance(req, res);
};
