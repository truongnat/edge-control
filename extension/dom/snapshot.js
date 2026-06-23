const DEFAULT_LIMITS = {
  getHtmlMaxChars: 16384,
  getTextMaxItems: 20,
  getTextMaxCharsPerItem: 500,
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

function getRole(el) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'input') return el.type || 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  return tag || 'generic';
}

function getAccessibleName(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    (el.labels?.[0]?.textContent?.trim()) ||
    (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'
      ? el.value
      : '') ||
    el.textContent?.trim()?.slice(0, 120) ||
    ''
  );
}

function isVisible(el) {
  if (!el || el.nodeType !== 1) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!style) return true;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isInteractive(el) {
  const tag = el.tagName?.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  const role = getRole(el);
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
  return false;
}

function shouldSkipNode(el) {
  const tag = el.tagName?.toLowerCase();
  return tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg';
}

/**
 * @param {Element} root
 * @param {{ interactiveOnly?: boolean, maxNodes?: number, depth?: number, includeBox?: boolean }} opts
 */
function buildSnapshot(root, opts = {}) {
  const interactiveOnly = opts.interactiveOnly !== false;
  const maxNodes = opts.maxNodes ?? DEFAULT_LIMITS.snapshotMaxNodes;
  const maxDepth = opts.depth ?? DEFAULT_LIMITS.snapshotDepth;
  const includeBox = opts.includeBox === true;
  const nodes = [];
  let refCounter = 0;

  function walk(el, depth) {
    if (!el || nodes.length >= maxNodes || depth > maxDepth) return;
    if (el.nodeType !== 1 || shouldSkipNode(el)) return;

    const interactive = isInteractive(el);
    const visible = isVisible(el);

    if (!interactiveOnly || interactive) {
      const ref = `e${refCounter++}`;
      el.setAttribute('data-edge-ref', ref);
      const node = {
        ref,
        role: getRole(el),
        name: getAccessibleName(el),
        tag: el.tagName.toLowerCase(),
        visible,
      };
      if (el.id) node.id = el.id;
      if (el.getAttribute('aria-label')) node.ariaLabel = el.getAttribute('aria-label');
      if (el.value !== undefined && el.value !== '') node.value = String(el.value).slice(0, 200);
      if (includeBox) {
        const rect = el.getBoundingClientRect();
        node.box = [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
      }
      nodes.push(node);
    }

    for (const child of el.children) {
      walk(child, depth + 1);
      if (nodes.length >= maxNodes) break;
    }
  }

  walk(root, 0);
  return { nodes, truncated: nodes.length >= maxNodes };
}
