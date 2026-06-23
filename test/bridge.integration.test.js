import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createBridge } from '../server/bridge.js';
import { ERROR_CODES } from '../server/errors.js';

const AUTH_TOKEN = 'test-token';

async function setup() {
  const bridge = createBridge({
    host: '127.0.0.1',
    port: 0,
    cmdTimeoutMs: 500,
    authToken: AUTH_TOKEN,
  });
  const address = await bridge.start();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { bridge, baseUrl };
}

function postCmd(baseUrl, path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
    body: JSON.stringify(body),
  });
}

function connectFakeExtension(baseUrl) {
  const wsUrl = baseUrl.replace('http://', 'ws://') + `/ext?token=${AUTH_TOKEN}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

test('rejects /cmd without token', async () => {
  const { bridge, baseUrl } = await setup();
  const res = await fetch(`${baseUrl}/cmd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ping' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.UNAUTHORIZED);
  await bridge.close();
});

test('rejects browser origins even with token', async () => {
  const { bridge, baseUrl } = await setup();
  const res = await fetch(`${baseUrl}/cmd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
      Origin: 'https://example.test',
    },
    body: JSON.stringify({ action: 'ping' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.UNAUTHORIZED);
  await bridge.close();
});

test('returns 503 when no extension is connected', async () => {
  const { bridge, baseUrl } = await setup();
  const res = await postCmd(baseUrl, '/cmd', { action: 'ping' });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.EXTENSION_DISCONNECTED);
  await bridge.close();
});

test('full round trip: HTTP /cmd -> WS to extension -> extension replies -> HTTP resolves', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    assert.equal(msg.action, 'navigate');
    assert.equal(msg.params.url, 'http://localhost:3000/');
    ws.send(JSON.stringify({ id: msg.id, result: { title: 'Scoring' } }));
  });

  const res = await postCmd(baseUrl, '/cmd', {
    action: 'navigate',
    params: { url: 'http://localhost:3000/' },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.result, { title: 'Scoring' });

  ws.close();
  await bridge.close();
});

test('times out with 408 if the extension never replies', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);
  ws.on('message', () => {
    /* deliberately never reply */
  });

  const res = await postCmd(baseUrl, '/cmd', { action: 'navigate', params: { url: 'http://x' } });
  assert.equal(res.status, 408);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.TIMEOUT);

  ws.close();
  await bridge.close();
});

test('in-flight request fails fast if the extension disconnects', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);
  ws.on('message', () => {
    ws.close();
  });

  const res = await postCmd(baseUrl, '/cmd', { action: 'navigate', params: { url: 'http://x' } });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.EXTENSION_DISCONNECTED);

  await bridge.close();
});

test('structured extension errors map to 422', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    ws.send(
      JSON.stringify({
        id: msg.id,
        error: {
          code: ERROR_CODES.ELEMENT_NOT_FOUND,
          message: 'No element matched selector: .missing',
          details: { selector: '.missing' },
        },
      }),
    );
  });

  const res = await postCmd(baseUrl, '/cmd', {
    action: 'click',
    params: { selector: '.missing' },
  });

  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, ERROR_CODES.ELEMENT_NOT_FOUND);

  ws.close();
  await bridge.close();
});

test('batch endpoint runs multiple steps', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.action === 'ping') {
      ws.send(JSON.stringify({ id: msg.id, result: { pong: true } }));
    } else if (msg.action === 'exists') {
      ws.send(JSON.stringify({ id: msg.id, result: { count: 1, visible: 1 } }));
    }
  });

  const res = await postCmd(baseUrl, '/cmd/batch', {
    steps: [{ action: 'ping' }, { action: 'exists', params: { selector: 'body' } }],
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.result.results.length, 2);
  assert.equal(body.result.results[0].ok, true);
  assert.equal(body.result.results[1].ok, true);

  ws.close();
  await bridge.close();
});

test('rejects invalid action with 400', async () => {
  const { bridge, baseUrl } = await setup();
  const ws = await connectFakeExtension(baseUrl);

  const res = await postCmd(baseUrl, '/cmd', { action: 'notReal', params: {} });
  assert.equal(res.status, 400);

  ws.close();
  await bridge.close();
});

test('a second extension connection replaces the first', async () => {
  const { bridge, baseUrl } = await setup();
  const first = await connectFakeExtension(baseUrl);
  const firstClosed = new Promise((resolve) => first.once('close', resolve));

  const second = await connectFakeExtension(baseUrl);
  await firstClosed;

  second.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    second.send(JSON.stringify({ id: msg.id, result: 'from-second' }));
  });

  const res = await postCmd(baseUrl, '/cmd', { action: 'ping' });
  const body = await res.json();
  assert.equal(body.result, 'from-second');

  second.close();
  await bridge.close();
});
