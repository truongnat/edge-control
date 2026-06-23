import { createError, ERROR_CODES, httpStatusForError, normalizeError } from './errors.js';

/**
 * @param {string} id
 * @param {string} action
 * @param {number} durationMs
 * @param {boolean} ok
 * @param {string} [errorCode]
 */
export function logCommand(id, action, durationMs, ok, errorCode) {
  if (!process.env.EDGE_CONTROL_LOG) return;
  const entry = {
    ts: new Date().toISOString(),
    id,
    action,
    durationMs,
    ok,
    ...(errorCode ? { errorCode } : {}),
  };
  console.error(JSON.stringify(entry));
}
