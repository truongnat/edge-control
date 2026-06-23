import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingRequests } from '../server/router.js';

test('resolve() fulfills the promise returned by register()', async () => {
  const pending = createPendingRequests();

  const promise = pending.register('req-1', 1000);
  const ok = pending.resolve('req-1', { hello: 'world' });

  assert.equal(ok, true);
  assert.deepEqual(await promise, { hello: 'world' });
  assert.equal(pending.size(), 0);
});

test('reject() rejects the promise returned by register()', async () => {
  const pending = createPendingRequests();

  const promise = pending.register('req-2', 1000);
  const ok = pending.reject('req-2', new Error('boom'));

  assert.equal(ok, true);
  await assert.rejects(promise, /boom/);
  assert.equal(pending.size(), 0);
});

test('resolve()/reject() on an unknown id is a no-op, returns false', () => {
  const pending = createPendingRequests();

  assert.equal(pending.resolve('missing', 1), false);
  assert.equal(pending.reject('missing', new Error('x')), false);
});

test('register() auto-rejects with a timeout error if never resolved', async () => {
  const pending = createPendingRequests();

  const promise = pending.register('req-3', 20);

  await assert.rejects(promise, /timed out/i);
  assert.equal(pending.size(), 0);
});

test('a late resolve() after timeout has already fired is a no-op', async () => {
  const pending = createPendingRequests();

  const promise = pending.register('req-4', 20);
  await assert.rejects(promise);

  assert.equal(pending.resolve('req-4', 'too-late'), false);
});

test('rejectAll() rejects every still-pending request (e.g. extension disconnected)', async () => {
  const pending = createPendingRequests();

  const a = pending.register('req-5', 5000);
  const b = pending.register('req-6', 5000);
  pending.rejectAll(new Error('extension disconnected'));

  await assert.rejects(a, /extension disconnected/);
  await assert.rejects(b, /extension disconnected/);
  assert.equal(pending.size(), 0);
});

test('two concurrent requests resolve independently and do not cross-talk', async () => {
  const pending = createPendingRequests();

  const a = pending.register('req-7', 1000);
  const b = pending.register('req-8', 1000);

  pending.resolve('req-8', 'second');
  pending.resolve('req-7', 'first');

  assert.equal(await a, 'first');
  assert.equal(await b, 'second');
});
