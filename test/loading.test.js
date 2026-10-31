import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoading } from '../public/js/logic/loading.js';

const MB = 1e6;

function make(overrides = {}) {
  return createLoading({
    downloads: [
      { id: 'coco-model', expectedBytes: 18 * MB },
      { id: 'face-model', expectedBytes: 4 * MB },
    ],
    stages: [
      { id: 'coco', label: 'COCO', expectedMs: 6000 },
      { id: 'faces', label: 'лица', expectedMs: 4000 },
    ],
    downloadShare: 0.6,
    maxMs: 25000,
    startedAt: 1000,
    ...overrides,
  });
}

function shuffled(items, seed) {
  const copy = [...items];
  let state = seed;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

test('progress never goes back, whatever order the events come in', () => {
  const events = [
    (l, t) => l.bytes('coco-model', 5 * MB),
    (l, t) => l.bytes('coco-model', 2 * MB),
    (l, t) => l.bytes('coco-model', 18 * MB, 20 * MB),
    (l, t) => l.bytes('face-model', 3 * MB, 4 * MB),
    (l, t) => l.finish('face-model', t),
    (l, t) => l.finish('coco-model', t, true),
    (l, t) => l.start('coco', t),
    (l, t) => l.start('faces', t),
    (l, t) => l.finish('faces', t),
    (l, t) => l.finish('coco', t),
    (l, t) => l.bytes('unknown', 99 * MB),
  ];
  for (let seed = 1; seed <= 50; seed += 1) {
    const loading = make();
    let last = loading.progress(1000);
    let now = 1000;
    for (const event of shuffled(events, seed)) {
      now += 700;
      event(loading, now);
      const value = loading.progress(now);
      assert.ok(value >= last, `seed ${seed}: ${value} < ${last}`);
      assert.ok(value >= 0 && value <= 1);
      last = value;
    }
  }
});

test('bytes are weighed by size: the big file moves the bar more', () => {
  const big = make();
  big.bytes('coco-model', 9 * MB);
  const small = make();
  small.bytes('face-model', 4 * MB);
  // 9 of 22 MB against 4 of 22 MB, inside the 0.6 download share.
  assert.ok(Math.abs(big.progress(1000) - (0.6 * 9) / 22) < 1e-9);
  assert.ok(Math.abs(small.progress(1000) - (0.6 * 4) / 22) < 1e-9);
});

test('an unknown total uses the expected size, and loaded past the total is capped', () => {
  const loading = make();
  loading.bytes('face-model', 2 * MB);
  assert.equal(loading.mbLine(), '2.0 из 22.0 МБ');
  loading.bytes('face-model', 9 * MB, 5 * MB);
  assert.equal(loading.mbLine(), '5.0 из 23.0 МБ');
  assert.ok(Math.abs(loading.progress(1000) - (0.6 * 5) / 23) < 1e-9);
});

test('a stage in work creeps but stays below its weight until it finishes', () => {
  const loading = make({ downloads: [] });
  loading.start('coco', 1000);
  const early = loading.progress(2000);
  const late = loading.progress(1000 + 10 * 60 * 1000);
  assert.ok(early > 0.6);
  assert.ok(late > early);
  // Both files are absent, so 0.6 is given; coco is half of the remaining 0.4.
  assert.ok(late < 0.6 + 0.4 * 0.5);
  loading.finish('coco', 1000 + 10 * 60 * 1000 + 1);
  assert.ok(loading.progress(1000 + 10 * 60 * 1000 + 1) >= 0.8 - 1e-9);
});

test('a failed stage counts as done', () => {
  const loading = make();
  loading.finish('coco', 3000, true);
  loading.finish('faces', 4000);
  assert.equal(loading.done(4000), true);
  assert.deepEqual(loading.waitingFor(), []);
});

test('everything ready gives 1 and done, even before the downloads report', () => {
  const loading = make();
  assert.equal(loading.done(1000), false);
  loading.finish('coco', 2000);
  loading.finish('faces', 2500);
  assert.equal(loading.progress(2500), 1);
  assert.equal(loading.done(2500), true);
});

test('the deadline ends the loading and names what it did not wait for', () => {
  const loading = make();
  loading.finish('faces', 5000);
  assert.equal(loading.done(25999), false);
  assert.equal(loading.done(26000), true);
  assert.deepEqual(loading.waitingFor(), ['coco']);
  assert.ok(loading.progress(26000) < 1);
});

test('phase follows the downloads, then the stages in order', () => {
  const loading = make();
  assert.equal(loading.phase(), 'download');
  loading.finish('coco-model', 2000);
  loading.finish('face-model', 2000, true);
  assert.equal(loading.phase(), 'coco');
  loading.finish('coco', 3000);
  assert.equal(loading.phase(), 'faces');
  loading.finish('faces', 4000);
  assert.equal(loading.phase(), null);
});

test('mbLine counts a finished file in full and a failed one by what came', () => {
  const loading = make();
  loading.bytes('coco-model', 3 * MB);
  loading.finish('coco-model', 2000, true);
  loading.finish('face-model', 2000);
  assert.equal(loading.mbLine(), '7.0 из 22.0 МБ');
});

test('summaryLine lists time, bytes before the tap, stages and what was not waited for', () => {
  const loading = createLoading({
    downloads: [{ id: 'coco-model', expectedBytes: 20 * MB, loaded: 15 * MB }],
    stages: [
      { id: 'coco', label: 'COCO', expectedMs: 6000 },
      { id: 'faces', label: 'лица', expectedMs: 4000 },
      { id: 'extra', label: 'ещё', expectedMs: 1000 },
    ],
    maxMs: 25000,
    startedAt: 1000,
  });
  loading.finish('coco-model', 3000);
  loading.start('coco', 3000);
  loading.finish('coco', 7100);
  loading.finish('faces', 5000, true);
  assert.equal(
    loading.summaryLine(10400),
    'Загрузка 9.4 с · скачано 20.0 МБ (до тапа 15.0) · COCO 6.1 с (прогрев 4.1 с) · лица 4.0 с сбой · ещё — · не дождались: ещё',
  );
});

test('summaryLine shows a dash when everything was waited for', () => {
  const loading = make({ downloads: [] });
  loading.finish('coco', 2000);
  loading.finish('faces', 3000);
  assert.equal(loading.summaryLine(3000), 'Загрузка 2.0 с · скачано 0.0 МБ (до тапа 0.0) · COCO 1.0 с · лица 2.0 с · не дождались: —');
});
