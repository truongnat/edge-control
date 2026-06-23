// Runs in MAIN world — perf probe + console capture.

(function installEdgeControlMainWorld() {
  const probe = {
    toDataURLCalls: 0,
    toDataURLTotalMs: 0,
    getContext2dCalls: 0,
    startedAt: performance.now(),
  };

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const t0 = performance.now();
    const result = origToDataURL.apply(this, args);
    probe.toDataURLCalls += 1;
    probe.toDataURLTotalMs += performance.now() - t0;
    return result;
  };

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    if (args[0] === '2d') probe.getContext2dCalls += 1;
    return origGetContext.apply(this, args);
  };

  const consoleBuffer = [];
  const CONSOLE_MAX = 100;
  const networkBuffer = [];
  const NETWORK_MAX = 200;

  function pushConsole(level, args) {
    consoleBuffer.push({
      level,
      text: args.map((a) => {
        try {
          return typeof a === 'string' ? a : JSON.stringify(a);
        } catch {
          return String(a);
        }
      }).join(' '),
      ts: Date.now(),
    });
    if (consoleBuffer.length > CONSOLE_MAX) consoleBuffer.shift();
  }

  for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
    const orig = console[level];
    console[level] = function (...args) {
      pushConsole(level, args);
      return orig.apply(console, args);
    };
  }

  function pushNetwork(entry) {
    networkBuffer.push({ ...entry, ts: Date.now() });
    if (networkBuffer.length > NETWORK_MAX) networkBuffer.shift();
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const startedAt = performance.now();
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const method = args[1]?.method || args[0]?.method || 'GET';
    try {
      const res = await origFetch.apply(this, args);
      pushNetwork({
        type: 'fetch',
        method,
        url: String(url || res.url || ''),
        status: res.status,
        ok: res.ok,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
      return res;
    } catch (err) {
      pushNetwork({
        type: 'fetch',
        method,
        url: String(url || ''),
        error: err?.message || String(err),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
      throw err;
    }
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__edgeControlNetwork = { method, url, startedAt: 0 };
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const meta = this.__edgeControlNetwork || {};
    meta.startedAt = performance.now();
    this.addEventListener('loadend', () => {
      pushNetwork({
        type: 'xhr',
        method: meta.method || 'GET',
        url: String(meta.url || this.responseURL || ''),
        status: this.status,
        ok: this.status >= 200 && this.status < 400,
        durationMs: Math.round((performance.now() - meta.startedAt) * 100) / 100,
      });
    });
    return origSend.apply(this, args);
  };

  window.addEventListener('edge-control:read-probe', () => {
    window.dispatchEvent(
      new CustomEvent('edge-control:probe-data', {
        detail: {
          installed: true,
          toDataURLCalls: probe.toDataURLCalls,
          toDataURLTotalMs: Math.round(probe.toDataURLTotalMs * 100) / 100,
          getContext2dCalls: probe.getContext2dCalls,
          elapsedMs: Math.round((performance.now() - probe.startedAt) * 100) / 100,
          usedJSHeapSizeMB: performance.memory
            ? Math.round((performance.memory.usedJSHeapSize / 1048576) * 100) / 100
            : null,
        },
      }),
    );
  });

  window.addEventListener('edge-control:read-console', () => {
    window.dispatchEvent(
      new CustomEvent('edge-control:console-data', {
        detail: { messages: consoleBuffer.slice() },
      }),
    );
  });

  window.addEventListener('edge-control:read-network', () => {
    const resources = performance
      .getEntriesByType('resource')
      .slice(-50)
      .map((entry) => ({
        type: 'resource',
        name: entry.name,
        initiatorType: entry.initiatorType,
        durationMs: Math.round(entry.duration * 100) / 100,
        transferSize: entry.transferSize,
        responseEnd: Math.round(entry.responseEnd * 100) / 100,
      }));
    window.dispatchEvent(
      new CustomEvent('edge-control:network-data', {
        detail: { messages: networkBuffer.slice(), resources },
      }),
    );
  });
})();
