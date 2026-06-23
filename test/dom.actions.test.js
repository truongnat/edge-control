import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  truncateText,
  queryAllInfo,
  getHtmlFromElement,
  DOM_DEFAULT_LIMITS,
} from '../server/dom/logic.js';

test('truncateText leaves short text unchanged', () => {
  const result = truncateText('hello', 10);
  assert.equal(result.text, 'hello');
  assert.equal(result.truncated, false);
});

test('truncateText truncates long text', () => {
  const result = truncateText('a'.repeat(100), 10);
  assert.equal(result.truncated, true);
  assert.equal(result.text.length, 11);
});

test('queryAllInfo caps item count', () => {
  const elements = Array.from({ length: 30 }, (_, i) => ({
    textContent: `item-${i}`,
    getAttribute: () => null,
    className: '',
  }));

  const result = queryAllInfo(elements, 5, 100);
  assert.equal(result.items.length, 5);
  assert.equal(result.total, 30);
  assert.equal(result.truncated, true);
});

test('getHtmlFromElement truncates large html', () => {
  const el = { outerHTML: 'x'.repeat(DOM_DEFAULT_LIMITS.getHtmlMaxChars + 100) };
  const result = getHtmlFromElement(el);
  assert.equal(result.truncated, true);
  assert.equal(result.html.length, DOM_DEFAULT_LIMITS.getHtmlMaxChars);
  assert.equal(result.totalChars, DOM_DEFAULT_LIMITS.getHtmlMaxChars + 100);
});
