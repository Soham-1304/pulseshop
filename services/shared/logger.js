const path = require("path");

const MAX_LOG_BUFFER = 200;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const PUSH_DEBOUNCE_MS = 30 * 1000;
const logBuffer = [];
const lastPushByRule = new Map();

function pruneLogBuffer(now = Date.now()) {
  const cutoff = now - SIX_HOURS_MS;
  while (logBuffer.length > 0) {
    const oldest = logBuffer[logBuffer.length - 1];
    const ts = Date.parse(oldest.timestamp);
    if ((Number.isFinite(ts) && ts < cutoff) || logBuffer.length > MAX_LOG_BUFFER) {
      logBuffer.pop();
    } else {
      break;
    }
  }
}

function pushIncidentBundleNonBlocking(serviceName, rule, entry) {
  const webhookBase = process.env.PATCHUP_WEBHOOK_URL || process.env.AEGIS_WEBHOOK_URL;
  if (!webhookBase || typeof fetch !== "function") return;

  const now = Date.now();
  const key = `${serviceName}:${rule}`;
  const lastPush = lastPushByRule.get(key) || 0;
  if (now - lastPush < PUSH_DEBOUNCE_MS) return;
  lastPushByRule.set(key, now);

  const url = `${webhookBase.replace(/\/+$/, "")}/api/webhooks/incident-bundle`;
  const payload = {
    projectId: process.env.PATCHUP_PROJECT_ID || process.env.AEGIS_PROJECT_ID || "pulseshop",
    repo: process.env.GITHUB_REPO_FULL_NAME || "Soham-1304/pulseshop",
    serviceId: serviceName.endsWith("-service") ? serviceName : `${serviceName}-service`,
    service: serviceName,
    rule,
    severity: "CRITICAL",
    windowHours: 6,
    topFrame: entry.topFrame || undefined,
    logs: logBuffer.slice(0, 50).map((item) => JSON.stringify(item)),
    metrics: {
      service: serviceName,
      errorMessage: entry.message,
      status: entry.status || 500,
      timestamp: entry.timestamp,
    },
    timestamp: entry.timestamp,
  };

  try {
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    }).catch(() => {});
  } catch (_err) {
    // Non-blocking reporter: never interrupt application request flow
    return undefined;
  }
}

/**
 * Parses a V8 Error stack trace and extracts the top application stack frame
 * relative to the repository root so git blame can pinpoint the exact file & line.
 */
function extractTopStackFrame(stack, serviceName) {
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

    // Normalize path relative to pulseshop repo root (handles both Docker and Vercel /var/task/src/...)
    const repoMarker = "services/";
    const idx = filePath.indexOf(repoMarker);
    let relativeFile;
    if (idx !== -1) {
      relativeFile = filePath.slice(idx);
    } else if (filePath.includes("/src/") && serviceName) {
      relativeFile = `services/${serviceName}/${filePath.slice(filePath.indexOf("/src/") + 1)}`;
    } else {
      relativeFile = path.basename(filePath);
    }

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
      entry.topFrame = extractTopStackFrame(meta.error.stack, serviceName);
      delete entry.error;
    } else if (typeof meta.stack === "string") {
      entry.topFrame = extractTopStackFrame(meta.stack, serviceName);
    }

    logBuffer.unshift(entry);
    pruneLogBuffer();

    let pushPromise;
    if (level === "error" && entry.topFrame) {
      pushPromise = pushIncidentBundleNonBlocking(serviceName, "ERR_5XX_SPIKE", entry);
    }

    const serialized = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(serialized + "\n");
    } else {
      process.stdout.write(serialized + "\n");
    }

    if (pushPromise) {
      Object.defineProperty(entry, "_pushPromise", { value: pushPromise, enumerable: false });
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
