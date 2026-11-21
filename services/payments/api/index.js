const { connectDB } = require("../src/shared");
const { createPaymentsApp, logger } = require("../src/index");

let appInstance = null;

module.exports = async function handler(req, res) {
  if (!appInstance) {
    await connectDB(logger);
    appInstance = createPaymentsApp();
  }
  return appInstance(req, res);
};
