// DOM action handlers — pure functions over document, testable with stubs.
// Loaded before content-isolated.js in manifest (shared classic-script scope).

const DOM_DEFAULT_LIMITS = {
  getHtmlMaxChars: 16384,
  getTextMaxItems: 20,
  getTextMaxCharsPerItem: 500,
};

function domResolveElement(selector, index, ref) {
  if (ref) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(ref) : ref.replace(/"/g, '\\"');
    return document.querySelector(`[data-edge-ref="${escaped}"]`);
  }
  if (!selector) return null;
  if (index !== undefined && index !== null) {
    const list = document.querySelectorAll(selector);
    return list[index] ?? null;
  }
  return document.querySelector(selector);
}

function domResolveTarget(params) {
  const el = domResolveElement(params.selector, params.index, params.ref);
  if (!el) {
    const err = new Error(
      params.ref
        ? `No element matched ref: ${params.ref}`
        : `No element matched selector: ${params.selector}`,
    );
    err.code = 'ELEMENT_NOT_FOUND';
    err.details = { selector: params.selector, index: params.index, ref: params.ref };
    throw err;
  }
  return el;
}

function domTruncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + '…', truncated: true };
}

function domQueryAllInfo(selector, maxItems, maxCharsPerItem) {
  const items = [];
  const elements = document.querySelectorAll(selector);
  const limit = maxItems ?? DOM_DEFAULT_LIMITS.getTextMaxItems;

  for (let i = 0; i < elements.length && items.length < limit; i++) {
    const el = elements[i];
    const rawText = el.textContent?.trim() || '';
    const { text, truncated } = domTruncateText(rawText, maxCharsPerItem ?? DOM_DEFAULT_LIMITS.getTextMaxCharsPerItem);
    items.push({
      text,
      textTruncated: truncated,
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      className: typeof el.className === 'string' ? el.className : '',
    });
  }

  return {
    items,
    total: elements.length,
    truncated: elements.length > limit,
  };
}

function domGetHtml(selector, maxChars) {
  const el = selector ? document.querySelector(selector) : document.documentElement;
  if (!el) {
    const err = new Error(`No element matched selector: ${selector}`);
    err.code = 'ELEMENT_NOT_FOUND';
    err.details = { selector };
    throw err;
  }
  const html = el.outerHTML || '';
  const limit = maxChars ?? DOM_DEFAULT_LIMITS.getHtmlMaxChars;
  if (html.length <= limit) {
    return { html, totalChars: html.length, truncated: false };
  }
  return {
    html: html.slice(0, limit),
    totalChars: html.length,
    truncated: true,
  };
}

function domFillElement(el, value) {
  const tag = el.tagName?.toLowerCase();
  el.focus();

  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      el.checked = Boolean(value);
    } else {
      el.value = value ?? '';
    }
  } else if (tag === 'textarea' || tag === 'select') {
    el.value = value ?? '';
  } else if (el.isContentEditable) {
    el.textContent = value ?? '';
  } else {
    el.value = value ?? '';
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function domPressKey(el, key) {
  const target = el || document.activeElement || document.body;
  const opts = { key, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent('keydown', opts));
  target.dispatchEvent(new KeyboardEvent('keyup', opts));
  if (key === 'Enter') {
    target.dispatchEvent(new KeyboardEvent('keypress', opts));
  }
}

function domSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function domWaitForSelector(selector, state, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 10000);
  const wantState = state || 'attached';

  while (Date.now() < deadline) {
    const el = document.querySelector(selector);
    const hasElement = Boolean(el);
    const visible = hasElement && isVisible(el);

    if (wantState === 'hidden' && (!hasElement || !visible)) {
      return { found: true, selector, state: wantState };
    }
    if (wantState === 'detached' && !hasElement) {
      return { found: true, selector, state: wantState };
    }
    if (wantState === 'visible' && hasElement && visible) {
      return { found: true, selector, state: wantState };
    }
    if (wantState === 'attached' && hasElement) {
      return { found: true, selector, state: wantState };
    }

    await domSleep(100);
  }

  const err = new Error(`Timeout waiting for selector: ${selector}`);
  err.code = 'TIMEOUT';
  err.details = { selector, state: wantState, timeoutMs };
  throw err;
}

async function domWaitForText(text, selector, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 10000);
  const needle = String(text);

  while (Date.now() < deadline) {
    const root = selector ? document.querySelector(selector) : document.body;
    const haystack = root?.textContent || '';
    if (haystack.includes(needle)) {
      return { found: true, text: needle, selector: selector || null };
    }
    await domSleep(100);
  }

  const err = new Error(`Timeout waiting for text: ${text}`);
  err.code = 'TIMEOUT';
  err.details = { text, selector, timeoutMs };
  throw err;
}

function domSelectOption(el, value, label) {
  if (el.tagName?.toLowerCase() !== 'select') {
    const err = new Error('selectOption requires a <select> element');
    err.code = 'INVALID_PARAMS';
    err.details = { selector: el };
    throw err;
  }

  let matched = null;
  for (const opt of el.options) {
    if (value !== undefined && opt.value === value) matched = opt;
    if (label !== undefined && opt.textContent?.trim() === label) matched = opt;
  }

  if (!matched) {
    const err = new Error('No matching option found');
    err.code = 'ELEMENT_NOT_FOUND';
    err.details = { value, label };
    throw err;
  }

  el.value = matched.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { selected: matched.value, label: matched.textContent?.trim() };
}

function domPointTarget(x, y) {
  return document.elementFromPoint(Number(x), Number(y)) || document.body || document.documentElement;
}

function domMouseEvent(type, x, y, opts = {}) {
  const target = domPointTarget(x, y);
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: Number(x),
      clientY: Number(y),
      button: opts.button === 'right' ? 2 : opts.button === 'middle' ? 1 : 0,
      buttons: opts.buttons ?? 0,
    }),
  );
  return target;
}

function domElementCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

function domElementInfo(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return {
    tag: el.tagName?.toLowerCase() || '',
    id: el.id || null,
    role: el.getAttribute('role'),
    name:
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.textContent?.trim()?.slice(0, 200) ||
      '',
    text: el.textContent?.trim()?.slice(0, 1000) || '',
    value: el.value !== undefined ? String(el.value).slice(0, 1000) : null,
    visible: isVisible(el),
    enabled: !el.disabled,
    disabled: Boolean(el.disabled),
    readOnly: Boolean(el.readOnly),
    box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    inViewport:
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth,
    styles: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
    },
  };
}

/**
 * Run a DOM action. Async actions return Promises.
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {unknown} lastProbeData
 */
async function runDomAction(action, params, lastProbeData, lastConsoleData, lastNetworkData) {
  switch (action) {
    case 'click': {
      const el = domResolveTarget(params);
      el.click();
      return { found: true, ref: params.ref || el.getAttribute('data-edge-ref') };
    }

    case 'clickAt': {
      const x = Number(params.x);
      const y = Number(params.y);
      const button = params.button || 'left';
      domMouseEvent('mousemove', x, y, { button });
      domMouseEvent('mousedown', x, y, { button, buttons: 1 });
      domMouseEvent('mouseup', x, y, { button });
      const target = domMouseEvent('click', x, y, { button });
      return { clicked: true, x, y, tag: target.tagName?.toLowerCase() || null };
    }

    case 'mouseMove': {
      const x = Number(params.x);
      const y = Number(params.y);
      const target = domMouseEvent('mousemove', x, y);
      return { moved: true, x, y, tag: target.tagName?.toLowerCase() || null };
    }

    case 'mouseDown': {
      const x = Number(params.x);
      const y = Number(params.y);
      const target = domMouseEvent('mousedown', x, y, { button: params.button || 'left', buttons: 1 });
      return { down: true, x, y, tag: target.tagName?.toLowerCase() || null };
    }

    case 'mouseUp': {
      const x = Number(params.x);
      const y = Number(params.y);
      const target = domMouseEvent('mouseup', x, y, { button: params.button || 'left' });
      return { up: true, x, y, tag: target.tagName?.toLowerCase() || null };
    }

    case 'wheel': {
      const x = Number(params.x) || Math.round(window.innerWidth / 2);
      const y = Number(params.y) || Math.round(window.innerHeight / 2);
      const target = domPointTarget(x, y);
      target.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          deltaX: Number(params.deltaX) || 0,
          deltaY: Number(params.deltaY) || 0,
        }),
      );
      if (params.nativeScroll !== false) {
        window.scrollBy(Number(params.deltaX) || 0, Number(params.deltaY) || 0);
      }
      return { wheeled: true, x, y, deltaX: Number(params.deltaX) || 0, deltaY: Number(params.deltaY) || 0 };
    }

    case 'drag': {
      let fromX = params.fromX !== undefined ? Number(params.fromX) : null;
      let fromY = params.fromY !== undefined ? Number(params.fromY) : null;
      if (fromX === null || fromY === null) {
        const el = domResolveTarget(params);
        const center = domElementCenter(el);
        fromX = center.x;
        fromY = center.y;
      }
      const toX = Number(params.toX);
      const toY = Number(params.toY);
      const steps = Math.max(1, Number(params.steps) || 12);
      domMouseEvent('mousemove', fromX, fromY);
      domMouseEvent('mousedown', fromX, fromY, { buttons: 1 });
      for (let i = 1; i <= steps; i++) {
        const x = fromX + ((toX - fromX) * i) / steps;
        const y = fromY + ((toY - fromY) * i) / steps;
        domMouseEvent('mousemove', x, y, { buttons: 1 });
      }
      domMouseEvent('mouseup', toX, toY);
      return { dragged: true, fromX, fromY, toX, toY, steps };
    }

    case 'doubleClick': {
      const el = domResolveTarget(params);
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      return { found: true };
    }

    case 'rightClick': {
      const el = domResolveTarget(params);
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return { found: true };
    }

    case 'fill': {
      const el = domResolveTarget(params);
      domFillElement(el, params.value);
      return { found: true };
    }

    case 'clear': {
      const el = domResolveTarget(params);
      domFillElement(el, '');
      return { found: true };
    }

    case 'focus': {
      const el = domResolveTarget(params);
      el.focus();
      return { focused: true };
    }

    case 'scroll': {
      if (params.x !== undefined || params.y !== undefined) {
        window.scrollTo(Number(params.x) || 0, Number(params.y) || 0);
        return { scrolled: true, x: params.x, y: params.y };
      }
      const el = domResolveTarget(params);
      el.scrollIntoView({ behavior: 'instant', block: params.block || 'center' });
      return { found: true };
    }

    case 'getText':
    case 'getElements': {
      if (!params.selector) {
        return { items: [], total: 0, truncated: false };
      }
      return domQueryAllInfo(params.selector, params.maxItems, params.maxCharsPerItem);
    }

    case 'getHtml':
      return domGetHtml(params.selector, params.maxChars);

    case 'getViewport':
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      };

    case 'readPerfProbe': {
      window.dispatchEvent(new CustomEvent('edge-control:read-probe'));
      await Promise.resolve();
      return lastProbeData || { installed: false };
    }

    case 'snapshot': {
      const root = params.selector ? document.querySelector(params.selector) : document.body;
      if (!root) {
        const err = new Error(`No element matched selector: ${params.selector}`);
        err.code = 'ELEMENT_NOT_FOUND';
        err.details = { selector: params.selector };
        throw err;
      }
      return buildSnapshot(root, {
        interactiveOnly: params.interactiveOnly !== false,
        maxNodes: params.maxNodes,
        depth: params.depth,
        includeBox: params.includeBox === true,
      });
    }

    case 'exists': {
      const elements = document.querySelectorAll(params.selector);
      let visible = 0;
      for (const el of elements) {
        if (isVisible(el)) visible++;
      }
      return { count: elements.length, visible };
    }

    case 'getAttribute': {
      const el = domResolveTarget(params);
      return { value: el.getAttribute(params.attribute) };
    }

    case 'elementInfo': {
      const el = domResolveTarget(params);
      return domElementInfo(el);
    }

    case 'query': {
      const el = domResolveTarget(params);
      const field = params.field;
      let value = null;
      if (field === 'text') value = el.textContent?.trim() || '';
      else if (field === 'value') value = el.value ?? null;
      else if (field === 'ariaLabel') value = el.getAttribute('aria-label');
      else if (field === 'title') value = el.getAttribute('title');
      else if (field === 'html') value = el.outerHTML?.slice(0, 500) || '';
      else {
        const err = new Error(`unknown query field: ${field}`);
        err.code = 'INVALID_PARAMS';
        err.details = { field };
        throw err;
      }
      return { field, value };
    }

    case 'waitForSelector':
      return domWaitForSelector(params.selector, params.state, params.timeoutMs);

    case 'waitForText':
      return domWaitForText(params.text, params.selector, params.timeoutMs);

    case 'press': {
      const el = params.selector || params.ref ? domResolveTarget(params) : null;
      domPressKey(el, params.key || 'Enter');
      return { pressed: params.key || 'Enter' };
    }

    case 'hover': {
      const el = domResolveTarget(params);
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return { found: true };
    }

    case 'selectOption': {
      const el = domResolveTarget(params);
      return domSelectOption(el, params.value, params.label);
    }

    case 'isEnabled': {
      const el = domResolveTarget(params);
      return {
        enabled: !el.disabled,
        disabled: Boolean(el.disabled),
        readOnly: Boolean(el.readOnly),
      };
    }

    case 'getComputedStyle': {
      const el = domResolveTarget(params);
      const props = Array.isArray(params.properties)
        ? params.properties
        : String(params.properties || 'display,visibility,opacity').split(',');
      const style = window.getComputedStyle(el);
      const values = {};
      for (const raw of props) {
        const p = raw.trim();
        if (p) values[p] = style.getPropertyValue(p);
      }
      return { properties: values };
    }

    case 'readConsole': {
      window.dispatchEvent(new CustomEvent('edge-control:read-console'));
      await Promise.resolve();
      const messages = lastConsoleData?.messages || [];
      const limit = params.maxMessages ?? 50;
      return {
        messages: messages.slice(-limit),
        total: messages.length,
        truncated: messages.length > limit,
      };
    }

    case 'readNetworkLog': {
      window.dispatchEvent(new CustomEvent('edge-control:read-network'));
      await Promise.resolve();
      const messages = lastNetworkData?.messages || [];
      const resources = lastNetworkData?.resources || [];
      const limit = params.maxMessages ?? 100;
      return {
        messages: messages.slice(-limit),
        resources,
        total: messages.length,
        truncated: messages.length > limit,
      };
    }

    default: {
      const err = new Error(`unknown content action: ${action}`);
      err.code = 'UNKNOWN_ACTION';
      err.details = { action };
      throw err;
    }
  }
}

// Export for Node tests (imported via test adapter)
if (typeof globalThis !== 'undefined' && globalThis.process?.versions?.node) {
  globalThis.__edgeControlDom = {
    runDomAction,
    domQueryAllInfo,
    domGetHtml,
    domResolveElement,
    domTruncateText,
    domElementInfo,
    buildSnapshot,
    isVisible,
    DOM_DEFAULT_LIMITS,
  };
}
