import { EDGE_ERROR_CODES, edgeCreateError, edgeSerializeError } from '../lib/errors-module.js';

export { edgeSerializeError };

const CONTENT_SCRIPT_TIMEOUT_MS = 20000;

const DOM_ACTIONS = new Set([
  'click', 'doubleClick', 'rightClick', 'fill', 'clear', 'focus', 'scroll',
  'clickAt', 'mouseMove', 'mouseDown', 'mouseUp', 'wheel', 'drag',
  'uploadFile',
  'getText', 'getElements', 'getHtml', 'readPerfProbe', 'readConsole',
  'readNetworkLog',
  'snapshot', 'exists', 'getAttribute', 'elementInfo', 'query', 'isEnabled', 'getComputedStyle',
  'waitForSelector', 'waitForText', 'press', 'hover', 'selectOption',
  'getViewport',
]);

const ALLOWLIST_STORAGE_KEY = 'allowedHosts';

async function getAllowedHosts() {
  const stored = await chrome.storage.local.get(ALLOWLIST_STORAGE_KEY);
  const raw = stored[ALLOWLIST_STORAGE_KEY];
  if (Array.isArray(raw)) return raw.map((h) => String(h).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
  }
  return [];
}

function hostAllowed(url, allowedHosts) {
  if (allowedHosts.length === 0) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return allowedHosts.some((allowed) => {
    if (allowed === '*') return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      return parsed.hostname.endsWith(suffix);
    }
    return parsed.hostname === allowed;
  });
}

async function assertTabAllowed(tabId) {
  const allowedHosts = await getAllowedHosts();
  if (allowedHosts.length === 0) return;
  const tab = await chrome.tabs.get(tabId);
  if (!hostAllowed(tab.url || '', allowedHosts)) {
    throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'tab URL is not allowed by edge-control allowlist', {
      tabId,
      url: tab.url,
      allowedHosts,
    });
  }
}

const DEBUGGER_INPUT_ACTIONS = new Set([
  'clickAt', 'mouseMove', 'mouseDown', 'mouseUp', 'wheel', 'drag', 'press',
]);

const DEBUGGER_VERSION = '1.3';
const networkMonitors = new Map();

// Tracked in chrome.storage.session (not a module variable) because the MV3
// service worker can be terminated and restarted mid-recording; the offscreen
// document keeps recording regardless, so this must survive the restart.
const RECORDING_STATE_KEY = 'edgeControlActiveRecordingTabId';

async function getActiveRecordingTabId() {
  const stored = await chrome.storage.session.get(RECORDING_STATE_KEY);
  return stored[RECORDING_STATE_KEY] ?? null;
}

async function setActiveRecordingTabId(tabId) {
  if (tabId === null) {
    await chrome.storage.session.remove(RECORDING_STATE_KEY);
  } else {
    await chrome.storage.session.set({ [RECORDING_STATE_KEY]: tabId });
  }
}

export async function resolveTabId(tabId) {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    throw edgeCreateError(EDGE_ERROR_CODES.NO_ACTIVE_TAB, 'no active tab found');
  }
  return tab.id;
}

export function sendToContentScript(tabId, action, params, timeoutMs = CONTENT_SCRIPT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        edgeCreateError(EDGE_ERROR_CODES.TIMEOUT, `content script timed out for action: ${action}`, {
          action,
          tabId,
          timeoutMs,
        }),
      );
    }, timeoutMs);

    const options = params.frameId !== undefined ? { frameId: Number(params.frameId) } : null;
    const callback = (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(
          edgeCreateError(
            EDGE_ERROR_CODES.CONTENT_SCRIPT_NOT_LOADED,
            `${chrome.runtime.lastError.message} (reload the tab after installing/updating the extension)`,
            { tabId, action },
          ),
        );
        return;
      }

      if (response?.error) {
        reject(edgeCreateError(response.error.code || EDGE_ERROR_CODES.UNKNOWN, response.error.message, response.error.details));
        return;
      }

      resolve(response);
    };
    if (options) {
      chrome.tabs.sendMessage(tabId, { action, params }, options, callback);
    } else {
      chrome.tabs.sendMessage(tabId, { action, params }, callback);
    }
  });
}

function debuggerTarget(tabId) {
  return { tabId };
}

async function debuggerCommand(tabId, method, params = {}) {
  return chrome.debugger.sendCommand(debuggerTarget(tabId), method, params);
}

async function withDebugger(tabId, fn) {
  const target = debuggerTarget(tabId);
  const monitor = networkMonitors.get(tabId);
  let attachedHere = false;
  if (!monitor?.attached) {
    await chrome.debugger.attach(target, DEBUGGER_VERSION);
    attachedHere = true;
  }
  try {
    return await fn();
  } finally {
    if (attachedHere) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        // ignore detach races
      }
    }
  }
}

function pushNetworkMonitorEvent(tabId, event) {
  const monitor = networkMonitors.get(tabId);
  if (!monitor) return;
  monitor.events.push({ ...event, ts: Date.now() });
  if (monitor.events.length > monitor.maxEvents) {
    monitor.events.splice(0, monitor.events.length - monitor.maxEvents);
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source.tabId || !networkMonitors.has(source.tabId)) return;
  if (!method.startsWith('Network.')) return;
  const event = { source: 'debugger', method, params };
  if (method === 'Network.requestWillBeSent') {
    event.requestId = params.requestId;
    event.url = params.request?.url;
    event.requestMethod = params.request?.method;
    event.type = params.type;
  } else if (method === 'Network.responseReceived') {
    event.requestId = params.requestId;
    event.url = params.response?.url;
    event.status = params.response?.status;
    event.mimeType = params.response?.mimeType;
    event.type = params.type;
  } else if (method === 'Network.loadingFailed') {
    event.requestId = params.requestId;
    event.errorText = params.errorText;
    event.canceled = params.canceled;
  } else if (method === 'Network.loadingFinished') {
    event.requestId = params.requestId;
    event.encodedDataLength = params.encodedDataLength;
  }
  pushNetworkMonitorEvent(source.tabId, event);
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (!source.tabId) return;
  const monitor = networkMonitors.get(source.tabId);
  if (monitor) {
    monitor.attached = false;
    monitor.detachReason = reason;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  networkMonitors.delete(tabId);
});

async function startNetworkMonitor(tabId, params = {}) {
  await assertTabAllowed(tabId);
  const existing = networkMonitors.get(tabId);
  if (existing?.attached) {
    return { tabId, monitoring: true, alreadyStarted: true, events: existing.events.length };
  }

  const monitor = existing || {
    attached: false,
    events: [],
    maxEvents: Math.max(50, Number(params.maxEvents) || 500),
    startedAt: Date.now(),
  };
  monitor.maxEvents = Math.max(50, Number(params.maxEvents) || monitor.maxEvents || 500);
  monitor.detachReason = null;
  networkMonitors.set(tabId, monitor);

  await chrome.debugger.attach(debuggerTarget(tabId), DEBUGGER_VERSION);
  monitor.attached = true;
  await debuggerCommand(tabId, 'Network.enable', {
    maxTotalBufferSize: Number(params.maxTotalBufferSize) || undefined,
    maxResourceBufferSize: Number(params.maxResourceBufferSize) || undefined,
  });
  return { tabId, monitoring: true, maxEvents: monitor.maxEvents };
}

async function stopNetworkMonitor(tabId) {
  const monitor = networkMonitors.get(tabId);
  if (!monitor) return { tabId, monitoring: false, alreadyStopped: true };
  try {
    if (monitor.attached) {
      await debuggerCommand(tabId, 'Network.disable');
      await chrome.debugger.detach(debuggerTarget(tabId));
    }
  } catch {
    // detach/disable may race with tab close
  }
  const events = monitor.events.length;
  networkMonitors.delete(tabId);
  return { tabId, monitoring: false, events };
}

async function sendToOffscreen(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response || response.ok !== true) {
    throw edgeCreateError(
      EDGE_ERROR_CODES.RECORDING_FAILED,
      response?.error || 'offscreen document did not respond',
    );
  }
  return response.result;
}

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record tab video as evidence via tabCapture + MediaRecorder.',
  });
}

async function startRecording(tabId, params = {}) {
  await assertTabAllowed(tabId);
  const existing = await getActiveRecordingTabId();
  if (existing !== null) {
    throw edgeCreateError(EDGE_ERROR_CODES.RECORDING_IN_PROGRESS, 'a recording is already in progress', {
      recordingTabId: existing,
    });
  }

  await ensureOffscreenDocument();

  // Activate the target tab and focus its window so getMediaStreamId works
  // without requiring activeTab to have been granted via user gesture.
  const tabForCapture = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tabForCapture.windowId, { focused: true });
  await new Promise(r => setTimeout(r, 800));

  // Capture the now-active tab without targetTabId to avoid activeTab restriction
  const streamId = await chrome.tabCapture.getMediaStreamId({});
  const result = await sendToOffscreen('offscreen:startRecording', {
    streamId,
    tabId,
    audio: Boolean(params.audio),
    maxDurationMs: params.maxDurationMs,
  });
  await setActiveRecordingTabId(tabId);
  return result;
}

async function stopRecording() {
  const tabId = await getActiveRecordingTabId();
  if (tabId === null) {
    throw edgeCreateError(EDGE_ERROR_CODES.NOT_RECORDING, 'no recording in progress');
  }
  try {
    const result = await sendToOffscreen('offscreen:stopRecording');
    return { tabId, ...result };
  } finally {
    await setActiveRecordingTabId(null);
  }
}

function readNetworkMonitor(tabId, maxMessages) {
  const monitor = networkMonitors.get(tabId);
  if (!monitor) {
    return { monitoring: false, events: [], total: 0 };
  }
  const limit = maxMessages ?? 200;
  return {
    monitoring: Boolean(monitor.attached),
    startedAt: monitor.startedAt,
    detachReason: monitor.detachReason || null,
    events: monitor.events.slice(-limit),
    total: monitor.events.length,
    truncated: monitor.events.length > limit,
  };
}

function buttonName(button) {
  if (button === 'right') return 'right';
  if (button === 'middle') return 'middle';
  return 'left';
}

async function runDebuggerInputAction(tabId, action, params) {
  return withDebugger(tabId, async () => {
    if (action === 'clickAt') {
      const x = Number(params.x);
      const y = Number(params.y);
      const button = buttonName(params.button);
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
      return { clicked: true, x, y, inputMode: 'debugger' };
    }

    if (action === 'mouseMove') {
      const x = Number(params.x);
      const y = Number(params.y);
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      return { moved: true, x, y, inputMode: 'debugger' };
    }

    if (action === 'mouseDown' || action === 'mouseUp') {
      const x = Number(params.x);
      const y = Number(params.y);
      const button = buttonName(params.button);
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: action === 'mouseDown' ? 'mousePressed' : 'mouseReleased',
        x,
        y,
        button,
        clickCount: 1,
      });
      return { action, x, y, button, inputMode: 'debugger' };
    }

    if (action === 'wheel') {
      const x = Number(params.x) || 0;
      const y = Number(params.y) || 0;
      const deltaX = Number(params.deltaX) || 0;
      const deltaY = Number(params.deltaY) || 0;
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX,
        deltaY,
      });
      return { wheeled: true, x, y, deltaX, deltaY, inputMode: 'debugger' };
    }

    if (action === 'drag') {
      const fromX = Number(params.fromX);
      const fromY = Number(params.fromY);
      const toX = Number(params.toX);
      const toY = Number(params.toY);
      const steps = Math.max(1, Number(params.steps) || 12);
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: fromX, y: fromY, button: 'none' });
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        const x = fromX + ((toX - fromX) * i) / steps;
        const y = fromY + ((toY - fromY) * i) / steps;
        await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
      }
      await debuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1 });
      return { dragged: true, fromX, fromY, toX, toY, steps, inputMode: 'debugger' };
    }

    if (action === 'press') {
      const key = params.key || 'Enter';
      await debuggerCommand(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key });
      await debuggerCommand(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key });
      return { pressed: key, inputMode: 'debugger' };
    }

    throw edgeCreateError(EDGE_ERROR_CODES.UNKNOWN_ACTION, `unknown debugger input action: ${action}`, { action });
  });
}

async function uploadFileWithDebugger(tabId, params) {
  const files = Array.isArray(params.files) ? params.files : [params.files];
  if (files.length === 0 || files.some((f) => !f || typeof f !== 'string')) {
    throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'uploadFile requires one or more file paths', {
      files: params.files,
    });
  }

  return withDebugger(tabId, async () => {
    const { root } = await debuggerCommand(tabId, 'DOM.getDocument', { depth: 1, pierce: true });
    const { nodeId } = await debuggerCommand(tabId, 'DOM.querySelector', {
      nodeId: root.nodeId,
      selector: params.selector,
    });
    if (!nodeId) {
      throw edgeCreateError(EDGE_ERROR_CODES.ELEMENT_NOT_FOUND, `No element matched selector: ${params.selector}`, {
        selector: params.selector,
      });
    }
    await debuggerCommand(tabId, 'DOM.setFileInputFiles', { nodeId, files });
    return { uploaded: true, selector: params.selector, files };
  });
}

function mapDownload(item) {
  return {
    id: item.id,
    url: item.url,
    finalUrl: item.finalUrl,
    filename: item.filename,
    mime: item.mime,
    state: item.state,
    paused: item.paused,
    error: item.error,
    bytesReceived: item.bytesReceived,
    totalBytes: item.totalBytes,
    exists: item.exists,
    startTime: item.startTime,
    endTime: item.endTime,
  };
}

function waitForDownload(params = {}) {
  const timeoutMs = Number(params.timeoutMs) || 30000;
  const startedAfter = params.startedAfter || new Date(Date.now() - 60000).toISOString();
  const filenameIncludes = params.filenameIncludes ? String(params.filenameIncludes) : '';
  const urlIncludes = params.urlIncludes ? String(params.urlIncludes) : '';

  function matches(item) {
    if (filenameIncludes && !String(item.filename || '').includes(filenameIncludes)) return false;
    if (urlIncludes && !String(item.url || '').includes(urlIncludes) && !String(item.finalUrl || '').includes(urlIncludes)) {
      return false;
    }
    if (item.startTime && item.startTime < startedAfter) return false;
    return true;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(listener);
      reject(edgeCreateError(EDGE_ERROR_CODES.TIMEOUT, 'timed out waiting for download', {
        timeoutMs,
        filenameIncludes,
        urlIncludes,
      }));
    }, timeoutMs);

    async function finishIfMatch(id) {
      const items = await chrome.downloads.search({ id });
      const item = items[0];
      if (item && item.state === 'complete' && matches(item)) {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        resolve(mapDownload(item));
      }
    }

    function listener(delta) {
      if (delta.state?.current === 'complete') {
        finishIfMatch(delta.id);
      }
    }

    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.search({ startedAfter }, (items) => {
      const match = items.find((item) => item.state === 'complete' && matches(item));
      if (match) {
        clearTimeout(timer);
        chrome.downloads.onChanged.removeListener(listener);
        resolve(mapDownload(match));
      }
    });
  });
}

export function waitForTabLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ loaded: false, timedOut: true });
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ loaded: true, timedOut: false });
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function runBackgroundAction(action, params) {
  switch (action) {
    case 'ping':
      return { pong: true, time: Date.now() };

    case 'listTabs': {
      const tabs = await chrome.tabs.query({});
      return tabs.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        active: t.active,
        windowId: t.windowId,
      }));
    }

    case 'getAllowlist': {
      return { allowedHosts: await getAllowedHosts() };
    }

    case 'setAllowlist': {
      const allowedHosts = Array.isArray(params.allowedHosts)
        ? params.allowedHosts.map((h) => String(h).trim()).filter(Boolean)
        : String(params.allowedHosts || '').split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
      await chrome.storage.local.set({ [ALLOWLIST_STORAGE_KEY]: allowedHosts });
      return { allowedHosts };
    }

    case 'listFrames': {
      const tabId = await resolveTabId(params.tabId);
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      return frames.map((f) => ({
        frameId: f.frameId,
        parentFrameId: f.parentFrameId,
        url: f.url,
        errorOccurred: f.errorOccurred,
      }));
    }

    case 'activateTab': {
      const tabId = await resolveTabId(params.tabId);
      const tab = await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return { id: tab.id, url: tab.url, title: tab.title };
    }

    case 'navigate': {
      if (!params.url) {
        throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'missing "url" param');
      }
      const allowedHosts = await getAllowedHosts();
      if (!hostAllowed(params.url, allowedHosts)) {
        throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'target URL is not allowed by edge-control allowlist', {
          url: params.url,
          allowedHosts,
        });
      }
      const tabId = await resolveTabId(params.tabId);
      await chrome.tabs.update(tabId, { url: params.url });
      const load = await waitForTabLoad(tabId, params.timeoutMs || 20000);
      const tab = await chrome.tabs.get(tabId);
      return { id: tab.id, url: tab.url, title: tab.title, ...load };
    }

    case 'newTab': {
      if (!params.url) {
        throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'missing "url" param');
      }
      const allowedHosts = await getAllowedHosts();
      if (!hostAllowed(params.url, allowedHosts)) {
        throw edgeCreateError(EDGE_ERROR_CODES.INVALID_PARAMS, 'target URL is not allowed by edge-control allowlist', {
          url: params.url,
          allowedHosts,
        });
      }
      const tab = await chrome.tabs.create({ url: params.url, active: params.active !== false });
      const load = await waitForTabLoad(tab.id, params.timeoutMs || 20000);
      const updated = await chrome.tabs.get(tab.id);
      return { id: updated.id, url: updated.url, title: updated.title, ...load };
    }

    case 'closeTab': {
      const tabId = await resolveTabId(params.tabId);
      await chrome.tabs.remove(tabId);
      return { closed: tabId };
    }

    case 'screenshot': {
      const tabId = await resolveTabId(params.tabId);
      await assertTabAllowed(tabId);
      const tab = await chrome.tabs.get(tabId);
      if (!tab.active) {
        await chrome.tabs.update(tabId, { active: true });
      }
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: params.format === 'jpeg' ? 'jpeg' : 'png',
          quality: params.quality,
        });
        if (params.returnDataUrl === false) {
          return { saved: true, format: params.format || 'png' };
        }
        return { dataUrl };
      } catch (err) {
        throw edgeCreateError(EDGE_ERROR_CODES.SCREENSHOT_FAILED, err.message, { tabId });
      }
    }

    case 'listDownloads': {
      const query = {};
      if (params.limit !== undefined) query.limit = Number(params.limit) || 20;
      if (params.filenameRegex) query.filenameRegex = String(params.filenameRegex);
      if (params.urlRegex) query.urlRegex = String(params.urlRegex);
      if (params.state) query.state = String(params.state);
      const items = await chrome.downloads.search(query);
      return { downloads: items.map(mapDownload), total: items.length };
    }

    case 'waitForDownload':
      return waitForDownload(params);

    case 'startNetworkMonitor': {
      const tabId = await resolveTabId(params.tabId);
      return startNetworkMonitor(tabId, params);
    }

    case 'stopNetworkMonitor': {
      const tabId = await resolveTabId(params.tabId);
      return stopNetworkMonitor(tabId);
    }

    case 'startRecording': {
      const tabId = await resolveTabId(params.tabId);
      return startRecording(tabId, params);
    }

    case 'stopRecording':
      return stopRecording();

    case 'setViewport': {
      const tabId = await resolveTabId(params.tabId);
      const tab = await chrome.tabs.get(tabId);
      const changes = {};
      if (params.width !== undefined) changes.width = Math.max(100, Number(params.width) || 0);
      if (params.height !== undefined) changes.height = Math.max(100, Number(params.height) || 0);
      if (Object.keys(changes).length > 0) {
        await chrome.windows.update(tab.windowId, changes);
      }
      if (params.zoom !== undefined) {
        await chrome.tabs.setZoom(tabId, Number(params.zoom) || 1);
      }
      return {
        tabId,
        windowId: tab.windowId,
        width: changes.width ?? null,
        height: changes.height ?? null,
        zoom: params.zoom !== undefined ? Number(params.zoom) || 1 : await chrome.tabs.getZoom(tabId),
      };
    }

    case 'getUrl': {
      const tabId = await resolveTabId(params.tabId);
      const tab = await chrome.tabs.get(tabId);
      return { url: tab.url };
    }

    case 'getTitle': {
      const tabId = await resolveTabId(params.tabId);
      const tab = await chrome.tabs.get(tabId);
      return { title: tab.title };
    }

    case 'reloadTab': {
      const tabId = await resolveTabId(params.tabId);
      await chrome.tabs.reload(tabId);
      const load = await waitForTabLoad(tabId, params.timeoutMs || 20000);
      const tab = await chrome.tabs.get(tabId);
      return { id: tab.id, url: tab.url, title: tab.title, ...load };
    }

    case 'readNetworkLog': {
      const tabId = await resolveTabId(params.tabId);
      await assertTabAllowed(tabId);
      let pageLog = null;
      try {
        pageLog = await sendToContentScript(tabId, action, params, params.timeoutMs || CONTENT_SCRIPT_TIMEOUT_MS);
      } catch (err) {
        pageLog = { error: edgeSerializeError(err) };
      }
      return {
        page: pageLog,
        debugger: readNetworkMonitor(tabId, params.maxMessages),
      };
    }

    case 'batch': {
      const steps = params.steps || [];
      const stopOnError = params.stopOnError !== false;
      const results = [];

      for (const step of steps) {
        try {
          const result = await runBackgroundAction(step.action, step.params || {});
          results.push({ ok: true, action: step.action, result });
        } catch (err) {
          const serialized = edgeSerializeError(err);
          results.push({ ok: false, action: step.action, error: serialized });
          if (stopOnError) break;
        }
      }

      return { results };
    }

    default: {
      if (DOM_ACTIONS.has(action)) {
        const tabId = await resolveTabId(params.tabId);
        await assertTabAllowed(tabId);
        if (action === 'uploadFile') {
          return uploadFileWithDebugger(tabId, params);
        }
        if (params.inputMode === 'debugger' && DEBUGGER_INPUT_ACTIONS.has(action)) {
          if (action === 'drag' && params.fromX === undefined) {
            throw edgeCreateError(
              EDGE_ERROR_CODES.INVALID_PARAMS,
              'debugger drag requires explicit fromX/fromY coordinates',
              { action },
            );
          }
          return runDebuggerInputAction(tabId, action, params);
        }
        return sendToContentScript(tabId, action, params, params.timeoutMs || CONTENT_SCRIPT_TIMEOUT_MS);
      }
      throw edgeCreateError(EDGE_ERROR_CODES.UNKNOWN_ACTION, `unknown action: ${action}`, { action });
    }
  }
}
