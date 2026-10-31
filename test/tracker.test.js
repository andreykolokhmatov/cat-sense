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

test('a track survives maxMissed empty cycles, then is gone', () => {
  const tracker = createTracker({ maxMissed: 8 });
  const [a] = tracker.update([left]);
  for (let i = 0; i < 8; i += 1) tracker.update([]);
  assert.equal(tracker.tracks()[0].missed, 8);
  assert.deepEqual(tracker.update([left]), [a]);
  for (let i = 0; i < 9; i += 1) tracker.update([]);
  assert.deepEqual(tracker.tracks(), []);
  const [again] = tracker.update([left]);
  assert.notEqual(again, a);
});

test('gap tells how many cycles the face was missing before it came back', () => {
  const tracker = createTracker();
  const [a] = tracker.update([left]);
  assert.equal(tracker.tracks()[0].gap, 0);
  tracker.update([shift(left, 10)]);
  assert.equal(tracker.tracks()[0].gap, 0);
  tracker.update([]);
  tracker.update([]);
  tracker.update([]);
  assert.deepEqual(tracker.update([shift(left, 10)]), [a]);
  assert.equal(tracker.tracks()[0].gap, 3);
});

// The bug from the phone: a hold on one person, the camera turns to another, and the new face
// took over the old track.
test('a lost track never takes a face that only appeared nearby', () => {
  const tracker = createTracker();
  const [a] = tracker.update([left]);
  tracker.update([]);
  // A smaller face beside the old place: close enough for the fast-move rule of a face in view
  // (0.35 of a box away), but its overlap with the old box is under minIou.
  const [other] = tracker.update([[160, 120, 50, 50]]);
  assert.notEqual(other, a);
});

test('a face still in view keeps its id when it slides over a lost track', () => {
  const tracker = createTracker();
  const [a] = tracker.update([[400, 300, 200, 240]]);
  tracker.update([]);
  const [own] = tracker.update([[700, 300, 200, 240]]);
  assert.notEqual(own, a);
  for (const x of [600, 520, 450, 400]) {
    assert.deepEqual(tracker.update([[x, 300, 200, 240]]), [own]);
  }
});

test('reset forgets every track', () => {
  const tracker = createTracker();
  const [a] = tracker.update([left]);
  tracker.reset();
  assert.deepEqual(tracker.tracks(), []);
  assert.notEqual(tracker.update([left])[0], a);
});

test('tracks() is a copy', () => {
  const tracker = createTracker();
  tracker.update([left]);
  tracker.tracks()[0].bbox = [0, 0, 1, 1];
  assert.deepEqual(tracker.tracks()[0].bbox, left);
});
