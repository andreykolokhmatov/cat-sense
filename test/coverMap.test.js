import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverTransform, screenToVideo, videoFrame, videoToScreen, visibleSource } from '../public/js/logic/coverMap.js';
import { pickTarget } from '../public/js/logic/pickTarget.js';

const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
const video = { width: 1920, height: 1080 };

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

test('videoFrame reads the live video size', () => {
  assert.deepEqual(videoFrame({ videoWidth: 720, videoHeight: 1280 }), { width: 720, height: 1280 });
});

test('portrait: screen center maps to the video center', () => {
  assert.deepEqual(screenToVideo({ x: 195, y: 422 }, portrait, video), { x: 960, y: 540 });
});

test('portrait: left screen edge is cropped to about x 710', () => {
  const { x, y } = screenToVideo({ x: 0, y: 0 }, portrait, video);
  assertClose(x, 710.4, 0.1);
  assertClose(y, 0);
});

test('landscape wider than the video crops the top and bottom', () => {
  const view = { width: 1000, height: 400 };
  const { scale, offsetX, offsetY } = coverTransform(view, video);
  assertClose(scale, 1000 / 1920);
  assertClose(offsetX, 0);
  assertClose(offsetY, (400 - 1080 * scale) / 2);
  assert.ok(offsetY < 0);
  assertClose(screenToVideo({ x: 500, y: 0 }, view, video).y, -offsetY / scale);
});

test('matching proportions have no offset', () => {
  assert.deepEqual(coverTransform({ width: 960, height: 540 }, video), { scale: 0.5, offsetX: 0, offsetY: 0 });
});

test('round trip through the screen returns the same box', () => {
  for (const view of [portrait, landscape]) {
    const [x, y, width, height] = videoToScreen([900, 500, 120, 80], view, video);
    const topLeft = screenToVideo({ x, y }, view, video);
    const bottomRight = screenToVideo({ x: x + width, y: y + height }, view, video);
    assertClose(topLeft.x, 900, 1e-6);
    assertClose(topLeft.y, 500, 1e-6);
    assertClose(bottomRight.x, 1020, 1e-6);
    assertClose(bottomRight.y, 580, 1e-6);
  }
});

test('tap is clamped into the frame', () => {
  const view = { width: 960, height: 540 };
  assert.deepEqual(screenToVideo({ x: -50, y: -50 }, view, video), { x: 0, y: 0 });
  assert.deepEqual(screenToVideo({ x: 5000, y: 5000 }, view, video), { x: 1920, y: 1080 });
});

test('zero video or view gives null', () => {
  const noVideo = { width: 0, height: 0 };
  assert.equal(coverTransform(portrait, noVideo), null);
  assert.equal(coverTransform({ width: 0, height: 0 }, video), null);
  assert.equal(screenToVideo({ x: 1, y: 1 }, portrait, noVideo), null);
  assert.equal(videoToScreen([0, 0, 10, 10], portrait, noVideo), null);
});

test('tap on the screen hits a box given in video coordinates', () => {
  const cup = { kind: 'object', label: 'cup', bbox: [900, 500, 120, 80] };
  const chair = { kind: 'object', label: 'chair', bbox: [1100, 500, 120, 80] };
  const [x, y, width, height] = videoToScreen(cup.bbox, portrait, video);
  const tap = screenToVideo({ x: x + width / 2, y: y + height / 2 }, portrait, video);
  assert.equal(pickTarget(tap, [cup, chair]), cup);
});

test('visibleSource is the centered part of the frame that stays on screen', () => {
  const view = { width: 390, height: 590 };
  const frame = { width: 720, height: 1280 };
  const { sx, sy, sw, sh } = visibleSource(view, frame);
  assertClose(sw / sh, 390 / 590, 1e-9);
  // The camera area is wider than the portrait frame, so the top and bottom are cut.
  assertClose(sw, 720, 1e-9);
  assertClose(sx, 0);
  assertClose(sy + sh / 2, 640, 1e-9);
  assert.ok(sy > 0 && sy + sh <= 1280);
  const corner = screenToVideo({ x: 0, y: 0 }, view, frame);
  assertClose(corner.x, sx, 1e-9);
  assertClose(corner.y, sy, 1e-9);
});

test('visibleSource with matching proportions is the whole frame', () => {
  assert.deepEqual(visibleSource({ width: 960, height: 540 }, video), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
});

test('visibleSource without a frame is null', () => {
  assert.equal(visibleSource(portrait, { width: 0, height: 0 }), null);
});
