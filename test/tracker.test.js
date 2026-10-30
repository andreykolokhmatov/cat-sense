import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTracker } from '../public/js/logic/tracker.js';

const left = [100, 100, 100, 100];
const right = [600, 100, 100, 100];

function shift([x, y, w, h], dx, dy = 0) {
  return [x + dx, y + dy, w, h];
}

test('a box that moves a little keeps its id', () => {
  const tracker = createTracker({ prefix: 'face-' });
  const [id] = tracker.update([left]);
  assert.equal(id, 'face-1');
  assert.deepEqual(tracker.update([shift(left, 20)]), [id]);
  assert.deepEqual(tracker.update([shift(left, 40, 10)]), [id]);
});

test('a fast move without overlap still matches by the center shift', () => {
  const tracker = createTracker();
  const [id] = tracker.update([left]);
  assert.deepEqual(tracker.update([shift(left, 55)]), [id]);
});

test('two faces keep their own ids, whatever the order of boxes', () => {
  const tracker = createTracker();
  const [a, b] = tracker.update([left, right]);
  assert.notEqual(a, b);
  assert.deepEqual(tracker.update([shift(right, -10), shift(left, 10)]), [b, a]);
});

test('a new face far away gets a new id', () => {
  const tracker = createTracker();
  const [a] = tracker.update([left]);
  const [first, second] = tracker.update([left, right]);
  assert.equal(first, a);
  assert.notEqual(second, a);
});

test('one box never goes to two tracks', () => {
  const tracker = createTracker();
  const [a, b] = tracker.update([left, shift(left, 30)]);
  assert.notEqual(a, b);
  const ids = tracker.update([shift(left, 15)]);
  assert.equal(ids.length, 1);
  assert.equal(tracker.tracks().filter(({ missed }) => missed === 0).length, 1);
});

test('mark and isGrudged', () => {
  const tracker = createTracker();
  const [a, b] = tracker.update([left, right]);
  tracker.mark(a);
  assert.equal(tracker.isGrudged(a), true);
  assert.equal(tracker.isGrudged(b), false);
  assert.equal(tracker.isGrudged('nobody'), false);
  tracker.update([shift(left, 10), right]);
  assert.equal(tracker.isGrudged(a), true);
});

test('a track survives maxMissed empty cycles, then goes with its grudge', () => {
  const tracker = createTracker({ maxMissed: 8 });
  const [a] = tracker.update([left]);
  tracker.mark(a);
  for (let i = 0; i < 8; i += 1) tracker.update([]);
  assert.equal(tracker.isGrudged(a), true);
  assert.equal(tracker.tracks()[0].missed, 8);
  assert.deepEqual(tracker.update([left]), [a]);
  for (let i = 0; i < 9; i += 1) tracker.update([]);
  assert.equal(tracker.isGrudged(a), false);
  assert.deepEqual(tracker.tracks(), []);
  const [again] = tracker.update([left]);
  assert.notEqual(again, a);
});

test('reset forgets every track and grudge', () => {
  const tracker = createTracker();
  const [a] = tracker.update([left]);
  tracker.mark(a);
  tracker.reset();
  assert.equal(tracker.isGrudged(a), false);
  assert.deepEqual(tracker.tracks(), []);
  assert.notEqual(tracker.update([left])[0], a);
});

test('tracks() is a copy', () => {
  const tracker = createTracker();
  tracker.update([left]);
  tracker.tracks()[0].grudged = true;
  assert.equal(tracker.tracks()[0].grudged, false);
});
