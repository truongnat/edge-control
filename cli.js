#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CODES } from './server/errors.js';

const PORT = process.env.EDGE_CONTROL_PORT || 8765;
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = process.env.EDGE_CONTROL_TOKEN_FILE || join(PROJECT_ROOT, '.edge-control', 'token');
function readToken() {
  if (process.env.EDGE_CONTROL_TOKEN) return process.env.EDGE_CONTROL_TOKEN;
  try {
    return readFileSync(resolve(TOKEN_FILE), 'utf8').trim();
  } catch {
    return '';
  }
}
const TOKEN = readToken();
const BASE_URL = `http://127.0.0.1:${PORT}`;

const EXIT = {
  BRIDGE_UNREACHABLE: 1,
  EXTENSION_DISCONNECTED: 2,
  COMMAND_ERROR: 3,
  TIMEOUT: 4,
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function buildParams(args) {
  const reserved = new Set([
    'out', 'timeoutMs', 'retries', 'compact', 'file', 'stopOnError', 'returnDataUrl',
  ]);
  const params = {};

  for (const [key, value] of Object.entries(args)) {
    if (reserved.has(key)) continue;
    params[key] = value;
  }

  if (params.tabId !== undefined) params.tabId = Number(params.tabId);
  if (params.active !== undefined) params.active = params.active !== 'false';
  if (params.quality !== undefined) params.quality = Number(params.quality);
  if (params.index !== undefined) params.index = Number(params.index);
  if (params.maxChars !== undefined) params.maxChars = Number(params.maxChars);
  if (params.maxItems !== undefined) params.maxItems = Number(params.maxItems);
  if (params.maxCharsPerItem !== undefined) params.maxCharsPerItem = Number(params.maxCharsPerItem);
  if (params.maxNodes !== undefined) params.maxNodes = Number(params.maxNodes);
  if (params.depth !== undefined) params.depth = Number(params.depth);
  if (params.interactiveOnly !== undefined) params.interactiveOnly = params.interactiveOnly !== 'false';
  if (params.includeBox !== undefined) params.includeBox = params.includeBox === 'true';
  if (params.maxMessages !== undefined) params.maxMessages = Number(params.maxMessages);
  if (params.width !== undefined) params.width = Number(params.width);
  if (params.height !== undefined) params.height = Number(params.height);
  if (params.zoom !== undefined) params.zoom = Number(params.zoom);
  if (params.x !== undefined) params.x = Number(params.x);
  if (params.y !== undefined) params.y = Number(params.y);
  if (params.fromX !== undefined) params.fromX = Number(params.fromX);
  if (params.fromY !== undefined) params.fromY = Number(params.fromY);
  if (params.toX !== undefined) params.toX = Number(params.toX);
  if (params.toY !== undefined) params.toY = Number(params.toY);
  if (params.deltaX !== undefined) params.deltaX = Number(params.deltaX);
  if (params.deltaY !== undefined) params.deltaY = Number(params.deltaY);
  if (params.frameId !== undefined) params.frameId = Number(params.frameId);
  if (params.steps !== undefined) params.steps = Number(params.steps);
  if (params.limit !== undefined) params.limit = Number(params.limit);
  if (params.maxEvents !== undefined) params.maxEvents = Number(params.maxEvents);
  if (params.maxTotalBufferSize !== undefined) params.maxTotalBufferSize = Number(params.maxTotalBufferSize);
  if (params.maxResourceBufferSize !== undefined) params.maxResourceBufferSize = Number(params.maxResourceBufferSize);
  if (params.nativeScroll !== undefined) params.nativeScroll = params.nativeScroll !== 'false';
  if (params.audio !== undefined) params.audio = params.audio !== 'false';
  if (params.maxDurationMs !== undefined) params.maxDurationMs = Number(params.maxDurationMs);
  if (typeof params.files === 'string') params.files = params.files.split(',').map((f) => f.trim()).filter(Boolean);
  if (typeof params.allowedHosts === 'string') {
    params.allowedHosts = params.allowedHosts.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
  }

  return params;
}

function printUsageAndExit(code = 1) {
  console.log(`Usage: node cli.js <action> [--key value ...]

Actions:
  ping | listTabs
  listFrames   [--tabId <id>]
  getAllowlist | setAllowlist --allowedHosts "localhost,*.example.com"
  activateTab  --tabId <id>
  navigate     --url <url> [--tabId <id>]
  newTab       --url <url> [--active false]
  closeTab     --tabId <id>
  reloadTab    [--tabId <id>]
  screenshot   [--tabId <id>] [--out shot.png] [--format png|jpeg]
  getUrl | getTitle [--tabId <id>]
  getViewport  [--tabId <id>]
  setViewport  [--width <px>] [--height <px>] [--zoom <n>] [--tabId <id>]
  snapshot     [--selector "<css>"] [--maxNodes <n>] [--interactiveOnly false]
  exists       --selector "<css>"
  elementInfo  --selector "<css>" OR --ref <e3>
  query        --selector "<css>" --field text|value|ariaLabel|title
  getText | getHtml [--selector "<css>"] [--maxChars <n>]
  click | fill | clear | focus | hover | doubleClick | rightClick
               --selector "<css>" OR --ref <e3 from snapshot>
  clickAt      --x <n> --y <n> [--inputMode debugger]
  mouseMove | mouseDown | mouseUp --x <n> --y <n>
  wheel        [--x <n>] [--y <n>] [--deltaY <n>]
  drag         [--selector "<css>" OR --fromX <n> --fromY <n>] --toX <n> --toY <n>
  fill         --value "<text>" (required)
  uploadFile   --selector "input[type=file]" --files "C:\\path\\a.png,C:\\path\\b.png"
  scroll       [--selector "<css>"] [--x <n>] [--y <n>]
  press        [--selector "<css>"] --key Enter
  selectOption --selector "<css>" [--value <v>] [--label <l>]
  isEnabled    --selector "<css>" OR --ref <e3>
  getComputedStyle --selector "<css>" [--properties display,opacity]
  waitForSelector --selector "<css>" [--state visible|hidden|detached]
  waitForText  --text "<text>" [--selector "<css>"]
  readConsole  [--maxMessages <n>]
  startNetworkMonitor [--tabId <id>] [--maxEvents <n>]
  stopNetworkMonitor [--tabId <id>]
  readNetworkLog [--maxMessages <n>]
  startRecording [--tabId <id>] [--audio] [--maxDurationMs <n>]
  stopRecording  [--out evidence.webm]
  readPerfProbe
  listDownloads [--limit <n>] [--state complete]
  waitForDownload [--filenameIncludes name] [--timeoutMs <n>]
  batch        --file steps.json

Global flags:
  --timeoutMs <n>   command timeout
  --retries <n>     retry on transient failures (default 0)
  --compact         single-line JSON output

Env:
  EDGE_CONTROL_PORT  bridge port (default 8765)
`);
  process.exit(code);
}

function compactJson(value) {
  return JSON.stringify(value);
}

function printResult(result, compact) {
  if (compact) {
    console.log(compactJson(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

function exitCodeForError(error) {
  const code = error?.code;
  if (code === ERROR_CODES.EXTENSION_DISCONNECTED) return EXIT.EXTENSION_DISCONNECTED;
  if (code === ERROR_CODES.TIMEOUT) return EXIT.TIMEOUT;
  return EXIT.COMMAND_ERROR;
}

function hintForError(error) {
  if (error?.code === ERROR_CODES.CONTENT_SCRIPT_NOT_LOADED) {
    return 'Hint: reload the tab after installing/updating the extension.';
  }
  if (error?.code === ERROR_CODES.EXTENSION_DISCONNECTED) {
    return 'Hint: open the extension popup and ensure status is connected.';
  }
  if (error?.code === ERROR_CODES.ELEMENT_NOT_FOUND) {
    return 'Hint: run snapshot or exists first to verify the selector.';
  }
  return '';
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function postCmd(endpoint, body, retries = 0) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
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
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw lastErr;
}

const [action, ...rest] = process.argv.slice(2);
if (!action || action === '-h' || action === '--help') {
  printUsageAndExit(action ? 0 : 1);
}

const args = parseArgs(rest);
const retries = args.retries !== undefined ? Number(args.retries) : 0;
const compact = Boolean(args.compact);

const health = await checkHealth();
if (!health) {
  console.error(`Could not reach bridge at ${BASE_URL}.`);
  console.error('Is the bridge running? -> npm start');
  process.exit(EXIT.BRIDGE_UNREACHABLE);
}

if (!health.extensionConnected && action !== 'ping') {
  console.error('Extension is not connected to the bridge.');
  console.error('Hint: load the extension in Edge and click Save & reconnect in the popup.');
  process.exit(EXIT.EXTENSION_DISCONNECTED);
}

let body;

try {
  if (action === 'batch') {
    if (!args.file) {
      console.error('batch requires --file steps.json');
      process.exit(EXIT.COMMAND_ERROR);
    }
    const steps = JSON.parse(readFileSync(args.file, 'utf8'));
    body = await postCmd(
      '/cmd/batch',
      {
        steps,
        stopOnError: args.stopOnError !== 'false',
        timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
      },
      retries,
    );
  } else {
    const params = buildParams(args);
    body = await postCmd(
      '/cmd',
      {
        action,
        params,
        timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
      },
      retries,
    );
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  if (err.code) console.error(`Code: ${err.code}`);
  const hint = hintForError(err);
  if (hint) console.error(hint);
  process.exit(exitCodeForError(err));
}

if (action === 'screenshot' && args.out) {
  const dataUrl = body.result?.dataUrl || '';
  const base64 = dataUrl.split(',')[1] || '';
  writeFileSync(args.out, Buffer.from(base64, 'base64'));
  printResult({ saved: args.out, format: args.format || 'png' }, compact);
} else if (action === 'stopRecording' && args.out) {
  const dataUrl = body.result?.dataUrl || '';
  const base64 = dataUrl.split(',')[1] || '';
  writeFileSync(args.out, Buffer.from(base64, 'base64'));
  printResult({ saved: args.out, bytes: body.result?.bytes, durationMs: body.result?.durationMs }, compact);
} else {
  printResult(body.result, compact);
}
