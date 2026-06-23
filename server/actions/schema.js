/** Default response limits for token-efficient reads. */
export const DEFAULT_LIMITS = {
  getHtmlMaxChars: 16384,
  getTextMaxItems: 20,
  getTextMaxCharsPerItem: 500,
  snapshotMaxNodes: 150,
  snapshotDepth: 8,
  consoleMaxMessages: 100,
};

/** @type {Record<string, { timeoutMs?: number, required?: string[], aliases?: string[] }>} */
export const ACTION_SCHEMA = {
  ping: { timeoutMs: 5000 },
  listTabs: { timeoutMs: 10000 },
  listFrames: { timeoutMs: 10000 },
  getAllowlist: { timeoutMs: 10000 },
  setAllowlist: { timeoutMs: 10000 },
  activateTab: { timeoutMs: 10000, required: ['tabId'] },
  navigate: { timeoutMs: 30000, required: ['url'] },
  newTab: { timeoutMs: 30000, required: ['url'] },
  closeTab: { timeoutMs: 10000, required: ['tabId'] },
  reloadTab: { timeoutMs: 30000 },
  screenshot: { timeoutMs: 20000 },
  listDownloads: { timeoutMs: 10000 },
  waitForDownload: { timeoutMs: 30000 },
  getViewport: { timeoutMs: 10000 },
  setViewport: { timeoutMs: 15000 },
  getUrl: { timeoutMs: 10000 },
  getTitle: { timeoutMs: 10000 },
  click: { timeoutMs: 15000 },
  clickAt: { timeoutMs: 15000, required: ['x', 'y'] },
  mouseMove: { timeoutMs: 15000, required: ['x', 'y'] },
  mouseDown: { timeoutMs: 15000, required: ['x', 'y'] },
  mouseUp: { timeoutMs: 15000, required: ['x', 'y'] },
  wheel: { timeoutMs: 15000 },
  drag: { timeoutMs: 20000, required: ['toX', 'toY'] },
  doubleClick: { timeoutMs: 15000 },
  rightClick: { timeoutMs: 15000 },
  fill: { timeoutMs: 15000, required: ['value'] },
  uploadFile: { timeoutMs: 20000, required: ['selector', 'files'] },
  clear: { timeoutMs: 15000 },
  focus: { timeoutMs: 15000 },
  scroll: { timeoutMs: 15000 },
  getText: { timeoutMs: 15000, required: ['selector'], aliases: ['getElements'] },
  getElements: { timeoutMs: 15000, required: ['selector'] },
  getHtml: { timeoutMs: 20000 },
  readPerfProbe: { timeoutMs: 15000 },
  readConsole: { timeoutMs: 15000 },
  startNetworkMonitor: { timeoutMs: 15000 },
  stopNetworkMonitor: { timeoutMs: 15000 },
  startRecording: { timeoutMs: 15000 },
  stopRecording: { timeoutMs: 30000 },
  readNetworkLog: { timeoutMs: 15000 },
  snapshot: { timeoutMs: 20000 },
  exists: { timeoutMs: 15000, required: ['selector'] },
  getAttribute: { timeoutMs: 15000, required: ['attribute'] },
  elementInfo: { timeoutMs: 15000 },
  query: { timeoutMs: 15000, required: ['field'] },
  isEnabled: { timeoutMs: 15000 },
  getComputedStyle: { timeoutMs: 15000 },
  waitForSelector: { timeoutMs: 30000, required: ['selector'] },
  waitForText: { timeoutMs: 30000, required: ['text'] },
  press: { timeoutMs: 15000 },
  hover: { timeoutMs: 15000 },
  selectOption: { timeoutMs: 15000 },
  batch: { timeoutMs: 120000 },
};

export const ALL_ACTIONS = Object.keys(ACTION_SCHEMA);

/**
 * @param {string} action
 * @returns {string}
 */
export function canonicalAction(action) {
  for (const [name, def] of Object.entries(ACTION_SCHEMA)) {
    if (name === action) return name;
    if (def.aliases?.includes(action)) return name;
  }
  return action;
}

/**
 * @param {string} action
 * @returns {number}
 */
export function defaultTimeoutMs(action) {
  const canonical = canonicalAction(action);
  return ACTION_SCHEMA[canonical]?.timeoutMs || 15000;
}
