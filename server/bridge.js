import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createPendingRequests } from './router.js';
import { validateCommand } from './actions/validate.js';
import { defaultTimeoutMs } from './actions/schema.js';
import { createError, ERROR_CODES, httpStatusForError, normalizeError } from './errors.js';
import { logCommand } from './logger.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.EDGE_CONTROL_PORT) || 8765;
const DEFAULT_CMD_TIMEOUT_MS = Number(process.env.EDGE_CONTROL_TIMEOUT_MS) || 15000;
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_FILE = process.env.EDGE_CONTROL_TOKEN_FILE || join(PROJECT_ROOT, '.edge-control', 'token');

function loadOrCreateAuthToken() {
  if (process.env.EDGE_CONTROL_TOKEN) return process.env.EDGE_CONTROL_TOKEN;
  try {
    const existing = readFileSync(TOKEN_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // create below
  }

  const token = randomUUID();
  mkdirSync(dirname(TOKEN_FILE), { recursive: true });
  writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  return token;
}

const DEFAULT_AUTH_TOKEN = loadOrCreateAuthToken();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return origin.startsWith('chrome-extension://') || origin.startsWith('edge-extension://');
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  if (req.headers['x-edge-control-token']) return String(req.headers['x-edge-control-token']);
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    return url.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

function requireAuthorizedRequest(req, authToken) {
  if (!isAllowedOrigin(req.headers.origin)) {
    throw createError(ERROR_CODES.UNAUTHORIZED, 'origin not allowed');
  }
  if (!authToken || tokenFromRequest(req) !== authToken) {
    throw createError(ERROR_CODES.UNAUTHORIZED, 'invalid or missing edge-control token');
  }
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolveFn, rejectFn) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        rejectFn(new Error('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveFn(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectFn);
  });
}

/**
 * @param {import('ws').WebSocket | null} extSocket
 * @param {ReturnType<typeof createPendingRequests>} pending
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {number} timeoutMs
 */
async function dispatchCommand(extSocket, pending, action, params, timeoutMs) {
  if (!extSocket) {
    throw createError(ERROR_CODES.EXTENSION_DISCONNECTED, 'extension not connected');
  }

  const id = randomUUID();
  const resultPromise = pending.register(id, timeoutMs);

  try {
    extSocket.send(JSON.stringify({ id, action, params: params || {} }));
  } catch (err) {
    pending.reject(id, err);
  }

  return resultPromise;
}

/**
 * @param {import('ws').WebSocket | null} extSocket
 * @param {ReturnType<typeof createPendingRequests>} pending
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {number} [overrideTimeoutMs]
 */
async function executeAction(extSocket, pending, action, params, overrideTimeoutMs) {
  const timeoutMs = overrideTimeoutMs || Number(params.timeoutMs) || defaultTimeoutMs(action);
  const start = Date.now();
  const id = randomUUID();

  try {
    const validated = validateCommand(action, params);
    const result = await dispatchCommand(
      extSocket,
      pending,
      validated.action,
      validated.params,
      timeoutMs,
    );
    logCommand(id, validated.action, Date.now() - start, true);
    return { ok: true, result };
  } catch (err) {
    const normalized = normalizeError(err);
    if (normalized.message?.includes('timed out')) {
      normalized.code = ERROR_CODES.TIMEOUT;
    }
    if (normalized.message?.includes('extension disconnected')) {
      normalized.code = ERROR_CODES.EXTENSION_DISCONNECTED;
    }
    logCommand(id, action, Date.now() - start, false, normalized.code);
    throw normalized;
  }
}

export function createBridge({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  cmdTimeoutMs = DEFAULT_CMD_TIMEOUT_MS,
  authToken = DEFAULT_AUTH_TOKEN,
} = {}) {
  const pending = createPendingRequests();

  /** @type {import('ws').WebSocket | null} */
  let extSocket = null;

  const httpServer = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, {
        ok: true,
        extensionConnected: Boolean(extSocket),
        version: '3.1.0',
      });
      return;
    }

    const pathname = (() => {
      try {
        return new URL(req.url || '/', 'http://127.0.0.1').pathname;
      } catch {
        return req.url;
      }
    })();
    const isCmd = req.method === 'POST' && pathname === '/cmd';
    const isBatch = req.method === 'POST' && pathname === '/cmd/batch';

    if (!isCmd && !isBatch) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'not found' } });
      return;
    }

    try {
      requireAuthorizedRequest(req, authToken);
    } catch (err) {
      const normalized = normalizeError(err);
      sendJson(res, httpStatusForError(normalized.code), {
        ok: false,
        error: normalized,
      });
      return;
    }

    if (!extSocket) {
      sendJson(res, 503, {
        ok: false,
        error: {
          code: ERROR_CODES.EXTENSION_DISCONNECTED,
          message: 'extension not connected',
        },
      });
      return;
    }

    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw || '{}');
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: {
          code: ERROR_CODES.INVALID_PARAMS,
          message: `invalid request body: ${err.message}`,
        },
      });
      return;
    }

    const requestId = randomUUID();

    if (isBatch) {
      try {
        validateCommand('batch', payload);
        const steps = payload.steps || [];
        const stopOnError = payload.stopOnError !== false;
        const results = [];

        for (const step of steps) {
          try {
            const { result } = await executeAction(
              extSocket,
              pending,
              step.action,
              step.params || {},
              payload.timeoutMs || cmdTimeoutMs,
            );
            results.push({ ok: true, action: step.action, result });
          } catch (err) {
            const normalized = normalizeError(err);
            results.push({ ok: false, action: step.action, error: normalized });
            if (stopOnError) break;
          }
        }

        sendJson(res, 200, { ok: true, id: requestId, result: { results } });
      } catch (err) {
        const normalized = normalizeError(err);
        sendJson(res, httpStatusForError(normalized.code), {
          ok: false,
          id: requestId,
          error: normalized,
        });
      }
      return;
    }

    const { action, params } = payload;
    if (!action || typeof action !== 'string') {
      sendJson(res, 400, {
        ok: false,
        error: { code: ERROR_CODES.INVALID_PARAMS, message: 'missing "action" field' },
      });
      return;
    }

    try {
      const timeoutMs = Number(payload.timeoutMs) || cmdTimeoutMs;
      const { result } = await executeAction(extSocket, pending, action, params || {}, timeoutMs);
      sendJson(res, 200, { ok: true, id: requestId, result });
    } catch (err) {
      const normalized = normalizeError(err);
      sendJson(res, httpStatusForError(normalized.code), {
        ok: false,
        id: requestId,
        error: normalized,
      });
    }
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ext',
    verifyClient(info, done) {
      try {
        requireAuthorizedRequest(info.req, authToken);
        done(true);
      } catch {
        done(false, 401, 'Unauthorized');
      }
    },
  });

  wss.on('connection', (socket) => {
    if (extSocket) {
      try {
        extSocket.close(4000, 'replaced by new connection');
      } catch {
        // ignore
      }
    }

    extSocket = socket;

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const { id, result, error } = msg || {};
      if (!id) return;

      if (error) {
        const structured =
          typeof error === 'object' && error.code
            ? error
            : { code: ERROR_CODES.UNKNOWN, message: String(error) };
        pending.reject(id, structured);
      } else {
        pending.resolve(id, result);
      }
    });

    socket.on('close', () => {
      if (extSocket === socket) {
        extSocket = null;
        pending.rejectAll(createError(ERROR_CODES.EXTENSION_DISCONNECTED, 'extension disconnected'));
      }
    });

    socket.on('error', () => {
      // surfaced to callers via pending request rejection/timeout
    });
  });

  function start() {
    return new Promise((resolveFn) => {
      httpServer.listen(port, host, () => resolveFn(httpServer.address()));
    });
  }

  function close() {
    return new Promise((resolveFn) => {
      wss.close(() => {
        httpServer.close(() => resolveFn());
      });
    });
  }

  return { httpServer, wss, start, close };
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const bridge = createBridge();
  bridge.start().then((address) => {
    console.log(`[edge-control] bridge listening on http://${address.address}:${address.port}`);
    console.log(`[edge-control] token: ${DEFAULT_AUTH_TOKEN}`);
    console.log(`[edge-control] extension bridge URL: ws://${address.address}:${address.port}/ext?token=${DEFAULT_AUTH_TOKEN}`);
  });
}
