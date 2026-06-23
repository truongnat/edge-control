// Persistent content script — thin router to dom/actions.js

let lastProbeData = null;
let lastConsoleData = null;
let lastNetworkData = null;

window.addEventListener('edge-control:probe-data', (event) => {
  lastProbeData = event.detail;
});

window.addEventListener('edge-control:console-data', (event) => {
  lastConsoleData = event.detail;
});

window.addEventListener('edge-control:network-data', (event) => {
  lastNetworkData = event.detail;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const { action, params = {} } = msg || {};

  runDomAction(action, params, lastProbeData, lastConsoleData, lastNetworkData)
    .then((result) => sendResponse(result))
    .catch((err) => {
      sendResponse({ error: edgeSerializeError(err) });
    });

  return true;
});
