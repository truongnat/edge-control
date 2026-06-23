import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ACTIONS } from '../server/actions/schema.js';
import { ACTION_MCP_MAP } from '../server/actions/coverage.js';
import { TOOLS } from '../mcp/tools.js';

test('every schema action has MCP mapping (except aliases)', () => {
  for (const action of ALL_ACTIONS) {
    if (action === 'getElements') continue;
    assert.ok(ACTION_MCP_MAP[action], `missing MCP map for action: ${action}`);
  }
});

test('every MCP map target has a registered MCP tool', () => {
  const toolNames = new Set(TOOLS.map((t) => t.name));
  const mappedTools = new Set(Object.values(ACTION_MCP_MAP));

  for (const tool of mappedTools) {
    assert.ok(toolNames.has(tool), `MCP tool missing: ${tool}`);
  }
});

test('MCP tool count covers full surface', () => {
  assert.ok(TOOLS.length >= 30, `expected 30+ tools, got ${TOOLS.length}`);
});
