import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout } from '../public/js/logic/withTimeout.js';

test('a value in time comes through', async () => {
  assert.equal(await withTimeout(Promise.resolve('model'), 50, null), 'model');
});

test('a plain value or null is passed as is', async () => {
  assert.equal(await withTimeout(null, 50, 'fallback'), null);
});

test('a promise that never settles gives the fallback after the time', async () => {
  const startedAt = performance.now();
  assert.equal(await withTimeout(new Promise(() => {}), 30, null), null);
  assert.ok(performance.now() - startedAt >= 25);
});

test('a rejection gives the fallback at once', async () => {
  assert.equal(await withTimeout(Promise.reject(new Error('no')), 1000, 'fallback'), 'fallback');
});
