const http = require("node:http");
const { Duplex } = require("node:stream");

class MockSocket extends Duplex {
  constructor() {
    super();
    this.remoteAddress = "127.0.0.1";
    this.remotePort = 54321;
    this.writable = true;
    this.readable = true;
  }
  _read() {}
  _write(_chunk, _encoding, callback) {
    callback();
  }
  setTimeout() {}
  setNoDelay() {}
  setKeepAlive() {}
  destroy() {}
}

/**
 * Invokes an Express application directly in memory without opening a TCP socket.
 * Works inside strict --network=none sandboxes, Vercel serverless, and fast unit tests.
 */
function invokeExpressApp(app, method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    try {
      const socket = new MockSocket();
      const req = new http.IncomingMessage(socket);
      req.method = method.toUpperCase();
      req.url = urlPath;
      req.originalUrl = urlPath;

      const payloadString = body !== null && body !== undefined ? JSON.stringify(body) : null;
      req.headers = {
        host: "localhost",
        ...(payloadString
          ? {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(payloadString)),
            }
          : {}),
        ...headers,
      };

      if (payloadString) {
        req.push(payloadString);
      }
      req.push(null);

      const res = new http.ServerResponse(req);
      res.assignSocket(socket);

      const chunks = [];
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);

      res.write = (chunk, encoding, cb) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        }
        return origWrite(chunk, encoding, cb);
      };

      res.end = (chunk, encoding, cb) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        }
        origEnd(chunk, encoding, cb);

        const raw = Buffer.concat(chunks).toString("utf8");
        let data = raw;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_e) {
          // keep raw text (e.g. /metrics output)
        }

        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          headers: res.getHeaders(),
          data,
        });
      };

      app.handle(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  invokeExpressApp,
};
