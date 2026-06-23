import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../mcp/tools.js';

test('TOOLS includes core agent workflow tools', () => {
  const names = TOOLS.map((t) => t.name);
  for (const expected of [
    'edge_health',
    'edge_snapshot',
    'edge_exists',
    'edge_click',
    'edge_wait_for',
    'edge_batch',
    'edge_screenshot',
  ]) {
    assert.ok(names.includes(expected), `missing tool: ${expected}`);
  }
});

test('each tool has name, description, inputSchema', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name);
    assert.ok(tool.description);
    assert.equal(tool.inputSchema.type, 'object');
  }
});

test('every MCP tool has a handler case', () => {
  const handlersSrc = readFileSync(new URL('../mcp/handlers.js', import.meta.url), 'utf8');
  for (const tool of TOOLS) {
    assert.match(handlersSrc, new RegExp(`case '${tool.name}':`));
  }
});
