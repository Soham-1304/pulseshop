const { connectDB } = require("../services/shared");
const { createGatewayApp, logger } = require("../services/gateway/src/index");

let cachedApp = null;

module.exports = async function handler(req, res) {
  if (!cachedApp) {
    await connectDB(logger);
    cachedApp = createGatewayApp({ inProcess: true });
  }

  // Restore original route path when rewritten by Vercel (e.g. /api/index.js?__path=/api/checkout)
  if (req.url && req.url.startsWith("/api/index.js")) {
    const parsed = new URL(req.url, "http://localhost");
    const targetPath = parsed.searchParams.get("__path");
    if (targetPath) {
      parsed.searchParams.delete("__path");
      const remainingQuery = parsed.searchParams.toString();
      req.url = remainingQuery ? `${targetPath}?${remainingQuery}` : targetPath;
      req.originalUrl = req.url;
    }
  }

  return cachedApp(req, res);
};
