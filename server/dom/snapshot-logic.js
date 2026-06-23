/** Pure snapshot helpers — mirrored in extension/dom/snapshot.js for browser. */

export const SNAPSHOT_DEFAULTS = {
  snapshotMaxNodes: 150,
  snapshotDepth: 8,
};

const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'summary', 'details', 'option',
]);

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
  'menuitem', 'tab', 'switch', 'slider', 'searchbox', 'option',
]);

/**
 * @param {{ getAttribute: (n: string) => string | null, tagName?: string, hasAttribute?: (n: string) => boolean, type?: string }} el
 */
export function getRole(el) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute?.('href')) return 'link';
  if (tag === 'input') return el.type || 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  return tag || 'generic';
}

/**
 * @param {{ getAttribute: (n: string) => string | null, tagName?: string, textContent?: string | null, value?: string, labels?: Array<{ textContent?: string | null }> }} el
 */
export function getAccessibleName(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    el.labels?.[0]?.textContent?.trim() ||
    (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName || '') ? el.value : '') ||
    el.textContent?.trim()?.slice(0, 120) ||
    ''
  );
}

/**
 * @param {{ tagName?: string, hasAttribute?: (n: string) => boolean, getAttribute: (n: string) => string | null }} el
 */
export function isInteractive(el) {
  const tag = el.tagName?.toLowerCase();
  if (tag && INTERACTIVE_TAGS.has(tag)) return true;
  const role = getRole(el);
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (el.hasAttribute?.('onclick') || el.hasAttribute?.('tabindex')) return true;
  return false;
}

export function shouldSkipTag(tag) {
  return tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg';
}

/**
 * @param {string} [selector]
 * @param {number} [index]
 * @param {string} [ref]
 */
export function buildElementLocator(selector, index, ref) {
  if (ref) return { ref, selector: `[data-edge-ref="${ref}"]` };
  if (selector && index !== undefined && index !== null) {
    return { selector, index };
  }
  return { selector };
}

/**
 * @param {string} state
 * @param {boolean} hasElement
 * @param {boolean} elementVisible
 */
export function waitForSelectorSatisfied(state, hasElement, elementVisible) {
  const s = state || 'attached';
  if (s === 'hidden') return !hasElement || !elementVisible;
  if (s === 'detached') return !hasElement;
  if (s === 'visible') return hasElement && elementVisible;
  return hasElement;
}
