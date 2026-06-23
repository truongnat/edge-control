const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Correlates async commands sent to the extension over WebSocket with their
 * HTTP responses, by request id. Pure in-memory logic, no network — kept
 * separate from bridge.js so it can be unit tested without a real socket.
 */
export function createPendingRequests() {
  const pending = new Map();

  function register(id, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolveFn, rejectFn) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectFn(new Error(`timed out waiting for response to ${id}`));
      }, timeoutMs);

      pending.set(id, { resolve: resolveFn, reject: rejectFn, timer });
    });
  }

  function resolve(id, result) {
    const entry = pending.get(id);
    if (!entry) return false;

    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(result);
    return true;
  }

  function reject(id, error) {
    const entry = pending.get(id);
    if (!entry) return false;

    clearTimeout(entry.timer);
    pending.delete(id);
    if (error && typeof error === 'object' && 'code' in error) {
      entry.reject(error);
    } else {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return true;
  }

  function rejectAll(error) {
    for (const id of [...pending.keys()]) {
      reject(id, error);
    }
  }

  function size() {
    return pending.size;
  }

  return { register, resolve, reject, rejectAll, size };
}
