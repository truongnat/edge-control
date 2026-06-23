import { createError, ERROR_CODES } from '../errors.js';
import { ACTION_SCHEMA, ALL_ACTIONS, canonicalAction } from './schema.js';
import { SELECTOR_OR_REF_ACTIONS } from './coverage.js';

/**
 * @param {string} action
 * @param {Record<string, unknown>} [params]
 */
export function validateCommand(action, params = {}) {
  if (!action || typeof action !== 'string') {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'missing "action" field');
  }

  const canonical = canonicalAction(action);
  if (!ALL_ACTIONS.includes(canonical)) {
    throw createError(ERROR_CODES.INVALID_ACTION, `unknown action: ${action}`, { action });
  }

  const def = ACTION_SCHEMA[canonical];
  const missing = (def.required || []).filter((key) => {
    const value = params[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw createError(ERROR_CODES.INVALID_PARAMS, `missing required params: ${missing.join(', ')}`, {
      action: canonical,
      missing,
    });
  }

  if (SELECTOR_OR_REF_ACTIONS.has(canonical)) {
    if (!params.selector && !params.ref) {
      throw createError(ERROR_CODES.INVALID_PARAMS, 'missing selector or ref', {
        action: canonical,
      });
    }
  }

  if (canonical === 'drag' && params.fromX === undefined && params.selector === undefined && params.ref === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'drag requires fromX/fromY, selector, or ref', {
      action: canonical,
    });
  }

  if (canonical === 'drag' && params.fromX !== undefined && params.fromY === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'drag with fromX requires fromY', {
      action: canonical,
    });
  }

  if (canonical === 'drag' && params.inputMode === 'debugger' && params.fromX === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'debugger drag requires fromX/fromY coordinates', {
      action: canonical,
    });
  }

  if (canonical === 'scroll' && !params.selector && !params.ref && params.x === undefined && params.y === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'scroll requires selector, ref, or x/y', {
      action: canonical,
    });
  }

  if (canonical === 'selectOption' && params.value === undefined && params.label === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'selectOption requires value or label', {
      action: canonical,
    });
  }

  if (canonical === 'setAllowlist' && params.allowedHosts === undefined) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'setAllowlist requires allowedHosts', {
      action: canonical,
    });
  }

  if (canonical === 'uploadFile') {
    const files = params.files;
    if (!Array.isArray(files) && typeof files !== 'string') {
      throw createError(ERROR_CODES.INVALID_PARAMS, 'uploadFile requires files as string or array', {
        action: canonical,
      });
    }
  }

  if (
    canonical === 'setViewport' &&
    params.width === undefined &&
    params.height === undefined &&
    params.zoom === undefined
  ) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'setViewport requires width, height, or zoom', {
      action: canonical,
    });
  }

  if (canonical === 'batch') {
    validateBatchParams(params);
  }

  return { action: canonical, params };
}

/**
 * @param {Record<string, unknown>} params
 */
function validateBatchParams(params) {
  const steps = params.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw createError(ERROR_CODES.INVALID_PARAMS, 'batch requires non-empty "steps" array');
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object' || !step.action) {
      throw createError(ERROR_CODES.INVALID_PARAMS, `batch step ${i} missing "action"`, { index: i });
    }
    validateCommand(step.action, step.params || {});
  }
}
