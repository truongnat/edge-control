import { test } from 'node:test';
import assert from 'node:assert/strict';
import { httpStatusForError, ERROR_CODES } from '../server/errors.js';

test('httpStatusForError maps known codes', () => {
  assert.equal(httpStatusForError(ERROR_CODES.INVALID_PARAMS), 400);
  assert.equal(httpStatusForError(ERROR_CODES.TIMEOUT), 408);
  assert.equal(httpStatusForError(ERROR_CODES.EXTENSION_DISCONNECTED), 503);
  assert.equal(httpStatusForError(ERROR_CODES.ELEMENT_NOT_FOUND), 422);
});

test('httpStatusForError defaults unknown codes to 422', () => {
  assert.equal(httpStatusForError('SOMETHING_ELSE'), 422);
});

test('httpStatusForError maps recording codes', () => {
  assert.equal(httpStatusForError(ERROR_CODES.RECORDING_IN_PROGRESS), 409);
  assert.equal(httpStatusForError(ERROR_CODES.NOT_RECORDING), 422);
  assert.equal(httpStatusForError(ERROR_CODES.RECORDING_FAILED), 422);
});
