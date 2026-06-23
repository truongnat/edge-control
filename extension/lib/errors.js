// Shared error helpers for the extension (classic script scope).

function edgeCreateError(code, message, details = {}) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function edgeSerializeError(err) {
  return {
    code: err.code || 'UNKNOWN',
    message: err.message,
    details: err.details || {},
  };
}

const EDGE_ERROR_CODES = {
  NO_ACTIVE_TAB: 'NO_ACTIVE_TAB',
  CONTENT_SCRIPT_NOT_LOADED: 'CONTENT_SCRIPT_NOT_LOADED',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  NAVIGATION_FAILED: 'NAVIGATION_FAILED',
  SCREENSHOT_FAILED: 'SCREENSHOT_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  RECORDING_IN_PROGRESS: 'RECORDING_IN_PROGRESS',
  NOT_RECORDING: 'NOT_RECORDING',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  INVALID_PARAMS: 'INVALID_PARAMS',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
};
