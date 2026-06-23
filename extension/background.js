import { runBackgroundAction, edgeSerializeError } from './actions/background-actions.js';

const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:8765/ext?token=fb733b10-8fa6-42c6-9d0c-4a07e6ee57f6';
const LEGACY_BRIDGE_URL = 'ws://127.0.0.1:8765/ext';
const RECONNECT_DELAY_MS = 3000;

/** @type {WebSocket | null} */
let ws = null;
let reconnectTimer = null;

async function getBridgeUrl() {
  const { bridgeUrl } = await chrome.storage.local.get('bridgeUrl');
  if (!bridgeUrl || bridgeUrl === LEGACY_BRIDGE_URL) {
    await chrome.storage.local.set({ bridgeUrl: DEFAULT_BRIDGE_URL });
    return DEFAULT_BRIDGE_URL;
  }
  return bridgeUrl || DEFAULT_BRIDGE_URL;
}

function connectionState() {
  if (!ws) return 'closed';
  if (ws.readyState === WebSocket.CONNECTING) return 'connecting';
  if (ws.readyState === WebSocket.OPEN) return 'open';
  if (ws.readyState === WebSocket.CLOSING) return 'closing';
  return 'closed';
}

async function setStatus(status) {
  await chrome.storage.local.set({ status });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const url = await getBridgeUrl();
  let socket;
  try {
    socket = new WebSocket(url);
  } catch (err) {
    await setStatus(`error: ${err.message}`);
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener('open', () => {
    setStatus('connected');
  });

  socket.addEventListener('message', async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const { id, action, params } = msg;
    if (!id) return;

    try {
      const result = await runBackgroundAction(action, params || {});
      socket.send(JSON.stringify({ id, result }));
      await chrome.storage.local.set({ lastError: '' });
    } catch (err) {
      const serialized = edgeSerializeError(err);
      socket.send(JSON.stringify({ id, error: serialized }));
      if (serialized.code === 'CONTENT_SCRIPT_NOT_LOADED') {
        await chrome.storage.local.set({
          lastError: 'Content script missing — reload the tab (F5).',
        });
      }
    }
  });

  socket.addEventListener('close', () => {
    if (ws === socket) ws = null;
    setStatus('disconnected');
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    // 'close' fires right after; reconnect is scheduled there.
  });
}

chrome.alarms.create('keepalive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') connect();
});

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.bridgeUrl) return;
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  connect();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { type } = msg || {};

  (async () => {
    if (type === 'popup:getDiagnostics') {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const storage = await chrome.storage.local.get(['status', 'lastError', 'allowedHosts', 'bridgeUrl']);
      let frames = [];
      let downloads = [];
      try {
        if (tab?.id !== undefined) {
          frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
        }
      } catch {
        frames = [];
      }
      try {
        downloads = await chrome.downloads.search({ limit: 3, orderBy: ['-startTime'] });
      } catch {
        downloads = [];
      }
      return {
        ok: true,
        status: storage.status || 'disconnected',
        socketState: connectionState(),
        bridgeUrl: storage.bridgeUrl || DEFAULT_BRIDGE_URL,
        lastError: storage.lastError || '',
        allowedHosts: Array.isArray(storage.allowedHosts) ? storage.allowedHosts : [],
        activeTab: tab
          ? { id: tab.id, title: tab.title, url: tab.url, active: tab.active, windowId: tab.windowId }
          : null,
        frames: frames.map((f) => ({
          frameId: f.frameId,
          parentFrameId: f.parentFrameId,
          url: f.url,
          errorOccurred: f.errorOccurred,
        })),
        downloads: downloads.map((d) => ({
          id: d.id,
          filename: d.filename,
          state: d.state,
          bytesReceived: d.bytesReceived,
          totalBytes: d.totalBytes,
        })),
      };
    }

    if (type === 'popup:reconnect') {
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      ws = null;
      await setStatus('connecting');
      await connect();
      return { ok: true, socketState: connectionState() };
    }

    if (type === 'popup:reloadActiveTab') {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) return { ok: false, error: 'no active tab' };
      await chrome.tabs.reload(tab.id);
      return { ok: true, tabId: tab.id };
    }

    if (type === 'popup:clearLastError') {
      await chrome.storage.local.set({ lastError: '' });
      return { ok: true };
    }

    return { ok: false, error: `unknown popup message: ${type}` };
  })()
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));

  return true;
});

connect();
