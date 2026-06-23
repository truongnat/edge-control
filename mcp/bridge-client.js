import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.EDGE_CONTROL_PORT || 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEFAULT_RETRIES = Number(process.env.EDGE_CONTROL_MCP_RETRIES) || 1;
const MCP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_FILE = process.env.EDGE_CONTROL_TOKEN_FILE || join(MCP_ROOT, '.edge-control', 'token');
function readToken() {
  if (process.env.EDGE_CONTROL_TOKEN) return process.env.EDGE_CONTROL_TOKEN;
  try {
    return readFileSync(resolve(TOKEN_FILE), 'utf8').trim();
  } catch {
    return '';
  }
}
const TOKEN = readToken();

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {number} [retries]
 */
async function postJson(path, body, retries = DEFAULT_RETRIES) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const parsed = await res.json();

      if (!res.ok) {
        const err = new Error(parsed.error?.message || 'unknown error');
        err.code = parsed.error?.code;
        err.details = parsed.error?.details;
        err.httpStatus = res.status;
        throw err;
      }

      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }

  throw lastErr;
}

export async function bridgeHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return { ok: false, bridgeReachable: true, extensionConnected: false };
    const data = await res.json();
    return { ...data, bridgeReachable: true };
  } catch {
    return { ok: false, bridgeReachable: false, extensionConnected: false };
  }
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 * @param {number} [timeoutMs]
 */
export async function bridgeCmd(action, params = {}, timeoutMs) {
  const health = await bridgeHealth();
  if (!health.bridgeReachable) {
    const err = new Error('Bridge not reachable. Run: npm start');
    err.code = 'BRIDGE_UNREACHABLE';
    throw err;
  }
  if (!health.extensionConnected && action !== 'ping') {
    const err = new Error('Extension not connected. Open Edge extension popup and reconnect.');
    err.code = 'EXTENSION_DISCONNECTED';
    throw err;
  }

  const body = await postJson('/cmd', { action, params, timeoutMs });
  return body.result;
}

/**
 * @param {Array<{ action: string, params?: Record<string, unknown> }>} steps
 * @param {boolean} [stopOnError]
 * @param {number} [timeoutMs]
 */
export async function bridgeBatch(steps, stopOnError = true, timeoutMs) {
  const body = await postJson('/cmd/batch', { steps, stopOnError, timeoutMs });
  return body.result;
}

const SCREENSHOT_DIR = process.env.EDGE_CONTROL_SCREENSHOT_DIR || join(MCP_ROOT, '.edge-control', 'screenshots');

export function resolveScreenshotPath(filename, format = 'png') {
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const safeName = filename || `shot-${Date.now()}.${ext}`;
  if (safeName !== basename(safeName)) {
    const err = new Error('screenshot filename must not include path separators');
    err.code = 'INVALID_PARAMS';
    throw err;
  }

  const root = resolve(SCREENSHOT_DIR);
  const filepath = resolve(root, safeName);
  if (filepath !== root && !filepath.startsWith(root + sep)) {
    const err = new Error('screenshot path escapes screenshot directory');
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return filepath;
}

/**
 * @param {{ tabId?: number, format?: string, filename?: string }} opts
 */
export async function bridgeScreenshotToFile(opts = {}) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const result = await bridgeCmd('screenshot', {
    tabId: opts.tabId,
    format: opts.format,
    returnDataUrl: true,
  });

  const format = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const filepath = resolveScreenshotPath(opts.filename, format);

  const dataUrl = result.dataUrl || '';
  const base64 = dataUrl.split(',')[1] || '';
  writeFileSync(filepath, Buffer.from(base64, 'base64'));

  return { saved: filepath, format, note: 'Image saved locally; path returned instead of base64 to save tokens.' };
}

const RECORDING_DIR = process.env.EDGE_CONTROL_RECORDING_DIR || join(MCP_ROOT, '.edge-control', 'recordings');

export function resolveRecordingPath(filename) {
  const safeName = filename || `recording-${Date.now()}.webm`;
  if (safeName !== basename(safeName)) {
    const err = new Error('recording filename must not include path separators');
    err.code = 'INVALID_PARAMS';
    throw err;
  }

  const root = resolve(RECORDING_DIR);
  const filepath = resolve(root, safeName);
  if (filepath !== root && !filepath.startsWith(root + sep)) {
    const err = new Error('recording path escapes recording directory');
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return filepath;
}

/**
 * @param {{ filename?: string }} opts
 */
export async function bridgeStopRecordingToFile(opts = {}) {
  mkdirSync(RECORDING_DIR, { recursive: true });

  const result = await bridgeCmd('stopRecording', {});
  const filepath = resolveRecordingPath(opts.filename);

  const dataUrl = result.dataUrl || '';
  const base64 = dataUrl.split(',')[1] || '';
  writeFileSync(filepath, Buffer.from(base64, 'base64'));

  return {
    saved: filepath,
    tabId: result.tabId,
    bytes: result.bytes,
    durationMs: result.durationMs,
    note: 'Video saved locally; path returned instead of base64 to save tokens.',
  };
}

export function formatToolResult(result, compact = process.env.EDGE_CONTROL_MCP_COMPACT === '1') {
  return compact ? JSON.stringify(result) : JSON.stringify(result, null, 2);
}

export { BASE_URL, SCREENSHOT_DIR, RECORDING_DIR };
