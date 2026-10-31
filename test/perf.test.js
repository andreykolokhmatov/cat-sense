import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cocoEvery, createAverage, createGovernor, nextPause } from '../public/js/logic/perf.js';

test('a quick tick keeps the usual period', () => {
  assert.equal(nextPause(250, 60), 190);
});

test('a slow tick still leaves the page idle time', () => {
  assert.equal(nextPause(250, 300), 240);
  assert.equal(nextPause(250, 1000), 800);
});

test('the pause is never negative', () => {
  assert.equal(nextPause(250, 0), 250);
  assert.ok(nextPause(0, 0) >= 0);
});

test('COCO runs every tick on a fast phone and less often on a slow one', () => {
  assert.equal(cocoEvery(40), 1);
  assert.equal(cocoEvery(90), 1);
  assert.equal(cocoEvery(120), 2);
  assert.equal(cocoEvery(181), 3);
});

test('the average starts at the first sample and follows later ones', () => {
  const average = createAverage(0.5);
  assert.equal(average.get(), null);
  assert.equal(average.add(100), 100);
  assert.equal(average.add(200), 150);
  assert.equal(average.get(), 150);
});

// Feeds frames at a steady interval, returns every level the governor stepped down to.
function run(governor, { intervalMs, fromMs = 0, untilMs }) {
  const steps = [];
  for (let now = fromMs; now <= untilMs; now += intervalMs) {
    const level = governor.frame(now);
    if (level !== null) steps.push({ at: now, level });
  }
  return steps;
}

test('a page at 60 fps never loses quality', () => {
  const governor = createGovernor();
  assert.deepEqual(run(governor, { intervalMs: 1000 / 60, untilMs: 20000 }), []);
  assert.ok(governor.fps > 55);
});

test('a page at 12 fps steps down after the warm-up and one window', () => {
  const governor = createGovernor();
  const [first] = run(governor, { intervalMs: 1000 / 12, untilMs: 8000 });
  assert.equal(first.level, 1);
  assert.ok(first.at >= 5000, `stepped down at ${first.at}, before warm-up plus a window`);
});

test('it keeps stepping down while slow, and stops at the last step', () => {
  const governor = createGovernor();
  const steps = run(governor, { intervalMs: 100, untilMs: 60000 });
  assert.deepEqual(steps.map((step) => step.level), [1, 2]);
  assert.equal(governor.level, 2);
});

test('after a step the new level gets its own warm-up', () => {
  const governor = createGovernor();
  const [first, second] = run(governor, { intervalMs: 100, untilMs: 60000 });
  assert.ok(second.at - first.at >= 5000, `${second.at - first.at} ms between steps`);
});

test('a slow start inside the warm-up does not count', () => {
  const governor = createGovernor();
  assert.deepEqual(run(governor, { intervalMs: 200, untilMs: 2900 }), []);
});

test('a long gap, as when the page was in the background, restarts the warm-up', () => {
  const governor = createGovernor();
  run(governor, { intervalMs: 1000 / 60, untilMs: 6000 });
  assert.equal(governor.frame(40000), null);
  assert.deepEqual(run(governor, { intervalMs: 200, fromMs: 40200, untilMs: 42500 }), []);
});

test('a recovered page stays at its level: quality does not climb back', () => {
  const governor = createGovernor();
  run(governor, { intervalMs: 100, untilMs: 8000 });
  const before = governor.level;
  run(governor, { intervalMs: 1000 / 60, fromMs: 8000, untilMs: 30000 });
  assert.equal(governor.level, before);
});
