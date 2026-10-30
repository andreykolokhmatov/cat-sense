import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grudgeMarks } from '../public/js/logic/grudgeMarks.js';

// A 1280x720 frame in a 390x600 view: scale 600/720, 338.33 px cut from each side.
const frame = { width: 1280, height: 720 };
const view = { width: 390, height: 600 };
const scale = 600 / 720;
const offsetX = (390 - 1280 * scale) / 2;

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not close to ${expected}`);
}

test('a grudged face gets a mark centred above it in screen pixels', () => {
  const bbox = [600, 300, 96, 120];
  const [mark] = grudgeMarks([{ id: 'face-1', bbox, missed: 0, grudged: true }], view, frame);
  const width = 96 * scale;
  const size = width * 0.6;
  close(mark.x, 600 * scale + offsetX + width / 2);
  close(mark.y, 300 * scale - size / 2);
  close(mark.size, size);
});

test('mark size is clamped to 28..80', () => {
  const small = grudgeMarks([{ bbox: [600, 300, 10, 10], grudged: true }], view, frame)[0];
  const big = grudgeMarks([{ bbox: [400, 300, 600, 400], grudged: true }], view, frame)[0];
  assert.equal(small.size, 28);
  assert.equal(big.size, 80);
});

test('a face at the top edge keeps its mark on screen', () => {
  const [mark] = grudgeMarks([{ bbox: [600, 0, 96, 120], grudged: true }], view, frame);
  assert.equal(mark.y, mark.size / 2);
});

test('faces without a grudge get no mark', () => {
  assert.deepEqual(grudgeMarks([{ bbox: [600, 300, 96, 120], grudged: false }], view, frame), []);
});

test('a face missing for more than two cycles loses its mark', () => {
  const tracks = [
    { bbox: [600, 300, 96, 120], grudged: true, missed: 2 },
    { bbox: [100, 300, 96, 120], grudged: true, missed: 3 },
  ];
  assert.equal(grudgeMarks(tracks, view, frame).length, 1);
});

test('empty input or an unknown frame gives no marks', () => {
  assert.deepEqual(grudgeMarks([], view, frame), []);
  assert.deepEqual(grudgeMarks([{ bbox: [0, 0, 10, 10], grudged: true }], view, { width: 0, height: 0 }), []);
});
