const path = require("path");

const MAX_LOG_BUFFER = 200;
const logBuffer = [];

/**
 * Parses a V8 Error stack trace and extracts the top application stack frame
 * relative to the repository root so git blame can pinpoint the exact file & line.
 */
function extractTopStackFrame(stack) {
  if (!stack || typeof stack !== "string") return null;
  const lines = stack.split("\n").slice(1);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("at ") || line.includes("node_modules") || line.includes("node:internal")) {
      continue;
    }

    // Match: at functionName (/abs/path/to/file.js:42:15) or at /abs/path/to/file.js:42:15
    const matchWithFn = line.match(/^at\s+([^\s(]+)\s+\((.+):(\d+):(\d+)\)$/);
    const matchDirect = line.match(/^at\s+(.+):(\d+):(\d+)$/);

    let fnName = "anonymous";
    let filePath = "";
    let lineNum = 0;
    let colNum = 0;

    if (matchWithFn) {
      fnName = matchWithFn[1];
      filePath = matchWithFn[2];
      lineNum = Number(matchWithFn[3]);
      colNum = Number(matchWithFn[4]);
    } else if (matchDirect) {
      filePath = matchDirect[1];
      lineNum = Number(matchDirect[2]);
      colNum = Number(matchDirect[3]);
    } else {
      continue;
    }

    // Normalize path relative to pulseshop repo root
    const repoMarker = "services/";
    const idx = filePath.indexOf(repoMarker);
    const relativeFile = idx !== -1 ? filePath.slice(idx) : path.basename(filePath);

    return {
      function: fnName,
      file: relativeFile,
      line: lineNum,
      column: colNum,
    };
  }
  return null;
}

function createLogger(serviceName) {
  const version = process.env.SERVICE_VERSION || "v1";
  const commit = process.env.GIT_COMMIT_SHA || "HEAD";

  function emit(level, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: serviceName,
      version,
      commit,
      message,
      ...meta,
    };

    if (meta.error instanceof Error) {
      entry.message = meta.error.message || message;
      entry.errorName = meta.error.name || "Error";
      entry.stack = meta.error.stack;
      entry.topFrame = extractTopStackFrame(meta.error.stack);
      delete entry.error;
    } else if (typeof meta.stack === "string") {
      entry.topFrame = extractTopStackFrame(meta.stack);
    }

    logBuffer.unshift(entry);
    if (logBuffer.length > MAX_LOG_BUFFER) {
      logBuffer.pop();
    }

    const serialized = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(serialized + "\n");
    } else {
      process.stdout.write(serialized + "\n");
    }

    return entry;
  }

  return {
    info: (msg, meta) => emit("info", msg, meta),
    warn: (msg, meta) => emit("warn", msg, meta),
    error: (msg, meta) => emit("error", msg, meta),
    getRecentLogs: (filter = {}) => {
      return logBuffer.filter((item) => {
        if (filter.level && item.level !== filter.level) return false;
        if (filter.service && item.service !== filter.service) return false;
        return true;
      });
    },
    clearLogs: () => {
      logBuffer.length = 0;
    },
  };
}

module.exports = {
  createLogger,
  extractTopStackFrame,
};
