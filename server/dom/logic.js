/**
 * Pure DOM logic mirrored for Node unit tests (matches extension/dom/actions.js).
 */

export const DOM_DEFAULT_LIMITS = {
  getHtmlMaxChars: 16384,
  getTextMaxItems: 20,
  getTextMaxCharsPerItem: 500,
};

export function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars) + '…', truncated: true };
}

export function queryAllInfo(elements, maxItems, maxCharsPerItem) {
  const items = [];
  const limit = maxItems ?? DOM_DEFAULT_LIMITS.getTextMaxItems;
  const perItem = maxCharsPerItem ?? DOM_DEFAULT_LIMITS.getTextMaxCharsPerItem;

  for (let i = 0; i < elements.length && items.length < limit; i++) {
    const el = elements[i];
    const rawText = el.textContent?.trim() || '';
    const { text, truncated } = truncateText(rawText, perItem);
    items.push({
      text,
      textTruncated: truncated,
      ariaLabel: el.getAttribute?.('aria-label') ?? null,
      title: el.getAttribute?.('title') ?? null,
      className: typeof el.className === 'string' ? el.className : '',
    });
  }

  return {
    items,
    total: elements.length,
    truncated: elements.length > limit,
  };
}

export function getHtmlFromElement(el, maxChars) {
  if (!el) return null;
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
