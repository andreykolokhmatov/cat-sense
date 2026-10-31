import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { countedFetch } from '../public/js/preload.js';

// Timings shrunk so a hang shows up as a failure in milliseconds, not as a stuck run.
const FAST = { stallMs: 80, graceMs: 30 };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// A fetch whose body ignores the abort signal, as WebKit may do once the headers are in.
function fakeFetch(pull, headers = {}) {
  globalThis.fetch = async () => new Response(new ReadableStream({ pull }, { highWaterMark: 0 }), { headers });
}

function pending() {
  return new Promise(() => {});
}

function within(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still pending after ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

test('a normal body comes back whole and is counted', async () => {
  const parts = [new Uint8Array([1, 2]), new Uint8Array([3])];
  fakeFetch((controller) => {
    const next = parts.shift();
    if (next) controller.enqueue(next);
    else controller.close();
  });
  let counted = 0;
  const response = await countedFetch('x', { ...FAST, onBytes: (n) => (counted += n) });
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  assert.equal(counted, 3);
});

test('all announced bytes but no end of stream: the data is kept after a short grace', async () => {
  let sent = false;
  fakeFetch(
    (controller) => {
      if (sent) return pending();
      sent = true;
      controller.enqueue(new Uint8Array([7, 8, 9]));
    },
    { 'content-length': '3' },
  );
  const response = await within(countedFetch('x', FAST), 1000);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8, 9]);
});

test('a body that stops halfway and ignores the abort is given up', async () => {
  let sent = false;
  fakeFetch(
    (controller) => {
      if (sent) return pending();
      sent = true;
      controller.enqueue(new Uint8Array([1]));
    },
    { 'content-length': '10' },
  );
  await assert.rejects(within(countedFetch('x', FAST), 1000), /stalled/);
});

test('empty chunks forever neither count as progress nor starve the timers', async () => {
  fakeFetch((controller) => controller.enqueue(new Uint8Array(0)));
  let timerFired = false;
  setTimeout(() => {
    timerFired = true;
  }, 10);
  await assert.rejects(within(countedFetch('x', FAST), 1000), /stalled/);
  assert.equal(timerFired, true);
});

test('headers that never come are given up even if the abort is ignored', async () => {
  globalThis.fetch = () => pending();
  await assert.rejects(within(countedFetch('x', FAST), 1000), /stalled/);
});
