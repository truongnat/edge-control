import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleToolCall } from '../mcp/handlers.js';
import { resolveScreenshotPath, resolveRecordingPath } from '../mcp/bridge-client.js';

test('handleToolCall rejects unknown tool', async () => {
  await assert.rejects(() => handleToolCall('edge_not_real', {}), /Unknown tool/);
});

test('handleToolCall rejects edge_wait_for without selector or text', async () => {
  await assert.rejects(() => handleToolCall('edge_wait_for', {}), /selector or text/);
});

test('resolveScreenshotPath rejects path traversal filenames', () => {
  assert.throws(() => resolveScreenshotPath('..\\escape.png'), /path separators/);
  assert.throws(() => resolveScreenshotPath('../escape.png'), /path separators/);
});

test('resolveRecordingPath rejects path traversal filenames', () => {
  assert.throws(() => resolveRecordingPath('..\\escape.webm'), /path separators/);
  assert.throws(() => resolveRecordingPath('../escape.webm'), /path separators/);
});
