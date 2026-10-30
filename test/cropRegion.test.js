import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cropRegion, tapBox } from '../public/js/logic/cropRegion.js';

const frame = { width: 1920, height: 1080 };

test('adds padding around the box', () => {
  const crop = cropRegion([800, 400, 200, 200], frame);
  assert.deepEqual(crop, { sx: 770, sy: 370, sw: 260, sh: 260, dw: 260, dh: 260 });
});

test('stays inside the frame near the top left corner', () => {
  const crop = cropRegion([0, 0, 300, 300], frame);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sw, 345);
});

test('stays inside the frame near the bottom right corner', () => {
  const crop = cropRegion([1700, 900, 220, 180], frame);
  assert.ok(crop.sx + crop.sw <= frame.width);
  assert.ok(crop.sy + crop.sh <= frame.height);
});

test('box partly outside the frame is cut to the frame', () => {
  const crop = cropRegion([-100, -100, 400, 400], frame);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sy, 0);
  assert.ok(crop.sw > 0 && crop.sh > 0);
});

test('box fully outside the frame returns null', () => {
  assert.equal(cropRegion([3000, 3000, 100, 100], frame), null);
});

test('tiny box grows to the minimum side for context', () => {
  const crop = cropRegion([900, 500, 10, 10], frame);
  assert.equal(crop.sw, 160);
  assert.equal(crop.sh, 160);
});

test('large crop scales down and keeps proportions', () => {
  const crop = cropRegion([200, 100, 1000, 500], frame);
  assert.equal(Math.max(crop.dw, crop.dh), 512);
  assert.ok(Math.abs(crop.dw / crop.dh - crop.sw / crop.sh) < 0.01);
});

test('small crop is not upscaled', () => {
  const crop = cropRegion([800, 400, 200, 200], frame);
  assert.equal(crop.dw, crop.sw);
});

test('options override the defaults', () => {
  const crop = cropRegion([800, 400, 200, 200], frame, { padding: 0, maxSide: 100 });
  assert.deepEqual(crop, { sx: 800, sy: 400, sw: 200, sh: 200, dw: 100, dh: 100 });
});

test('tapBox is centered on the tap', () => {
  assert.deepEqual(tapBox({ x: 500, y: 300 }, 200), [400, 200, 200, 200]);
});

test('tapBox near the edge still gives a valid crop', () => {
  const crop = cropRegion(tapBox({ x: 5, y: 5 }), frame);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sy, 0);
  assert.ok(crop.sw > 0 && crop.sh > 0);
});
