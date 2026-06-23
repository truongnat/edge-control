#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { bridgeHealth, BASE_URL } from './bridge-client.js';
import { handleToolCall } from './handlers.js';
import { TOOLS } from './tools.js';

const server = new Server(
  { name: 'edge-control', version: '3.1.0' },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'edge-control://health',
      name: 'Bridge Health',
      description: 'Bridge and extension connection status',
      mimeType: 'application/json',
    },
    {
      uri: 'edge-control://playbook',
      name: 'Agent Playbook',
      description: 'Token-efficient workflow for controlling Edge',
      mimeType: 'text/markdown',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'edge-control://health') {
    const health = await bridgeHealth();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ bridgeUrl: BASE_URL, ...health }, null, 2),
        },
      ],
    };
  }

  if (uri === 'edge-control://playbook') {
    const text = `# edge-control Agent Playbook

1. **edge_health** — verify bridge + extension before starting
2. **edge_snapshot** — read page (prefer over edge_get_html)
3. **edge_exists** — verify selector before click
4. **edge_wait_for** — wait for UI instead of retry loops
5. **edge_click** / **edge_fill** — interact
6. **edge_read_perf_probe** — measure canvas/heap when debugging perf

Token tips:
- edge_snapshot: ~2-5 KB vs edge_get_html: up to 16 KB+ truncated
- edge_query / edge_exists: tiny reads
- edge_screenshot: saves file locally, returns path only
- edge_batch: one HTTP round-trip for multi-step flows
`;
    return {
      contents: [{ uri, mimeType: 'text/markdown', text }],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    const text = await handleToolCall(name, args);
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const hint =
      err.code === 'EXTENSION_DISCONNECTED'
        ? '\nHint: open Edge extension popup → Save & reconnect.'
        : err.code === 'BRIDGE_UNREACHABLE'
          ? '\nHint: run `npm start` in edge-control.'
          : err.code === 'CONTENT_SCRIPT_NOT_LOADED'
            ? '\nHint: reload the tab (F5) after extension update.'
            : '';
    return {
      content: [{ type: 'text', text: `Error [${err.code || 'UNKNOWN'}]: ${err.message}${hint}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
