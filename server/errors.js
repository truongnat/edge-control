/** @typedef {{ code: string, message: string, details?: Record<string, unknown> }} StructuredError */

export const ERROR_CODES = {
  BRIDGE_UNREACHABLE: 'BRIDGE_UNREACHABLE',
  EXTENSION_DISCONNECTED: 'EXTENSION_DISCONNECTED',
  TIMEOUT: 'TIMEOUT',
  INVALID_ACTION: 'INVALID_ACTION',
  INVALID_PARAMS: 'INVALID_PARAMS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NO_ACTIVE_TAB: 'NO_ACTIVE_TAB',
  CONTENT_SCRIPT_NOT_LOADED: 'CONTENT_SCRIPT_NOT_LOADED',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  NAVIGATION_FAILED: 'NAVIGATION_FAILED',
  SCREENSHOT_FAILED: 'SCREENSHOT_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  RECORDING_IN_PROGRESS: 'RECORDING_IN_PROGRESS',
  NOT_RECORDING: 'NOT_RECORDING',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  UNKNOWN: 'UNKNOWN',
};

/**
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
export function createError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

/**
 * @param {unknown} err
 * @returns {StructuredError}
 */
export function normalizeError(err) {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return {
      code: String(err.code),
      message: String(err.message),
      details: /** @type {Record<string, unknown>} */ (err.details || {}),
    };
  }

  if (err instanceof Error) {
    return {
      code: err.code || ERROR_CODES.UNKNOWN,
      message: err.message,
      details: err.details || {},
    };
  }

  return {
    code: ERROR_CODES.UNKNOWN,
    message: String(err),
    details: {},
  };
}

/**
 * @param {string} code
 * @returns {number}
 */
export function httpStatusForError(code) {
  switch (code) {
    case ERROR_CODES.INVALID_ACTION:
    case ERROR_CODES.INVALID_PARAMS:
      return 400;
    case ERROR_CODES.UNAUTHORIZED:
      return 401;
    case ERROR_CODES.NO_ACTIVE_TAB:
    case ERROR_CODES.ELEMENT_NOT_FOUND:
    case ERROR_CODES.CONTENT_SCRIPT_NOT_LOADED:
      return 422;
    case ERROR_CODES.TIMEOUT:
      return 408;
    case ERROR_CODES.EXTENSION_DISCONNECTED:
      return 503;
    case ERROR_CODES.RECORDING_IN_PROGRESS:
      return 409;
    case ERROR_CODES.NAVIGATION_FAILED:
    case ERROR_CODES.SCREENSHOT_FAILED:
    case ERROR_CODES.RECORDING_FAILED:
    case ERROR_CODES.NOT_RECORDING:
    case ERROR_CODES.UNKNOWN_ACTION:
      return 422;
    default:
      return 422;
  }
}
