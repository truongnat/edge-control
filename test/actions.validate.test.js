import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from '../server/actions/validate.js';
import { ERROR_CODES } from '../server/errors.js';

test('validateCommand accepts known actions', () => {
  const result = validateCommand('click', { selector: 'button' });
  assert.equal(result.action, 'click');
});

test('validateCommand canonicalizes aliases', () => {
  const result = validateCommand('getElements', { selector: 'div' });
  assert.equal(result.action, 'getText');
});

test('validateCommand rejects click without selector or ref', () => {
  assert.throws(
    () => validateCommand('click', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand accepts click with ref', () => {
  const result = validateCommand('click', { ref: 'e3' });
  assert.equal(result.action, 'click');
});

test('validateCommand rejects hover without selector or ref', () => {
  assert.throws(
    () => validateCommand('hover', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand accepts scroll with x/y only', () => {
  const result = validateCommand('scroll', { x: 0, y: 100 });
  assert.equal(result.action, 'scroll');
});

test('validateCommand rejects elementInfo without selector or ref', () => {
  assert.throws(
    () => validateCommand('elementInfo', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand rejects setViewport without size or zoom', () => {
  assert.throws(
    () => validateCommand('setViewport', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand accepts setViewport with zoom only', () => {
  const result = validateCommand('setViewport', { zoom: 0.9 });
  assert.equal(result.action, 'setViewport');
});

test('validateCommand accepts coordinate click', () => {
  const result = validateCommand('clickAt', { x: 10, y: 20 });
  assert.equal(result.action, 'clickAt');
});

test('validateCommand rejects drag without source', () => {
  assert.throws(
    () => validateCommand('drag', { toX: 100, toY: 200 }),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand rejects debugger drag without coordinates', () => {
  assert.throws(
    () => validateCommand('drag', { selector: '.handle', toX: 100, toY: 200, inputMode: 'debugger' }),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand rejects setAllowlist without hosts', () => {
  assert.throws(
    () => validateCommand('setAllowlist', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand accepts uploadFile with file list', () => {
  const result = validateCommand('uploadFile', { selector: 'input[type=file]', files: ['C:\\tmp\\a.txt'] });
  assert.equal(result.action, 'uploadFile');
});

test('validateCommand accepts network monitor actions', () => {
  assert.equal(validateCommand('startNetworkMonitor', { maxEvents: 100 }).action, 'startNetworkMonitor');
  assert.equal(validateCommand('stopNetworkMonitor', {}).action, 'stopNetworkMonitor');
});

test('validateCommand accepts recording actions', () => {
  assert.equal(validateCommand('startRecording', { audio: true }).action, 'startRecording');
  assert.equal(validateCommand('stopRecording', {}).action, 'stopRecording');
});

test('validateCommand rejects unknown actions', () => {
  assert.throws(
    () => validateCommand('flyToMoon', {}),
    (err) => err.code === ERROR_CODES.INVALID_ACTION,
  );
});

test('validateCommand rejects missing required params', () => {
  assert.throws(
    () => validateCommand('click', {}),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});

test('validateCommand validates batch steps', () => {
  const result = validateCommand('batch', {
    steps: [{ action: 'ping' }, { action: 'exists', params: { selector: 'body' } }],
  });
  assert.equal(result.action, 'batch');
});

test('validateCommand rejects empty batch', () => {
  assert.throws(
    () => validateCommand('batch', { steps: [] }),
    (err) => err.code === ERROR_CODES.INVALID_PARAMS,
  );
});
