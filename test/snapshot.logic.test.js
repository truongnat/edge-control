import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRole,
  getAccessibleName,
  isInteractive,
  shouldSkipTag,
  waitForSelectorSatisfied,
} from '../server/dom/snapshot-logic.js';

test('getRole maps button tag', () => {
  assert.equal(getRole({ getAttribute: () => null, tagName: 'BUTTON' }), 'button');
});

test('getRole prefers explicit aria role', () => {
  assert.equal(getRole({ getAttribute: (n) => (n === 'role' ? 'switch' : null), tagName: 'DIV' }), 'switch');
});

test('getAccessibleName prefers aria-label', () => {
  const name = getAccessibleName({
    getAttribute: (n) => (n === 'aria-label' ? 'Save draft' : null),
    textContent: 'ignored',
  });
  assert.equal(name, 'Save draft');
});

test('isInteractive detects button tag', () => {
  assert.equal(isInteractive({ tagName: 'BUTTON', getAttribute: () => null }), true);
});

test('shouldSkipTag skips script', () => {
  assert.equal(shouldSkipTag('script'), true);
  assert.equal(shouldSkipTag('div'), false);
});

test('waitForSelectorSatisfied visible state', () => {
  assert.equal(waitForSelectorSatisfied('visible', true, true), true);
  assert.equal(waitForSelectorSatisfied('visible', true, false), false);
});

test('waitForSelectorSatisfied hidden state', () => {
  assert.equal(waitForSelectorSatisfied('hidden', false, false), true);
  assert.equal(waitForSelectorSatisfied('hidden', true, true), false);
});
