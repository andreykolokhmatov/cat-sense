import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BINS,
  colorSignature,
  colorSimilarity,
  faceGeometry,
  frameGain,
  geometryDifference,
  mixColor,
  mixGeometry,
} from '../public/js/logic/appearance.js';

const W = 192;
const H = 108;
const WALL = [120, 110, 100];
const SKIN = [220, 170, 140];
const BLACK = [25, 22, 20];
const BLOND = [215, 180, 90];
const RED = [200, 40, 40];
const BLUE = [40, 60, 190];
const LIGHT_GRAY = [190, 190, 190];

function frame(background = WALL) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i += 1) data.set([...background, 255], i * 4);
  return { data, width: W, height: H };
}

function fill(pixels, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y += 1) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x += 1) {
      pixels.data.set([...color, 255], (y * W + x) * 4);
    }
  }
}

// A person drawn around the face box: hair above it, a shirt from the shoulders down.
function person(pixels, [x, y, w, h], { hair = BLACK, shirt = RED } = {}) {
  fill(pixels, x, y - 0.5 * h, x + w, y + 0.1 * h, hair);
  fill(pixels, x, y + 0.1 * h, x + w, y + h, SKIN);
  fill(pixels, x - 0.5 * w, y + 1.25 * h, x + 1.5 * w, y + 3 * h, shirt);
  return [x, y, w, h];
}

function darker(pixels, factor) {
  const data = pixels.data.map((value, i) => (i % 4 === 3 ? value : value * factor));
  return { ...pixels, data };
}

test('the same person in another place and size looks the same', () => {
  const a = frame();
  const boxA = person(a, [40, 20, 20, 24]);
  const b = frame();
  const boxB = person(b, [120, 10, 26, 30]);
  assert.ok(colorSimilarity(colorSignature(a, boxA), colorSignature(b, boxB)) > 0.9);
});

test('another shirt colour is another person', () => {
  const a = frame();
  const box = person(a, [40, 20, 20, 24], { shirt: RED });
  const b = frame();
  person(b, [40, 20, 20, 24], { shirt: BLUE });
  assert.ok(colorSimilarity(colorSignature(a, box), colorSignature(b, box)) < 0.5);
});

test('another hair colour lowers the score, but less than clothes', () => {
  const a = frame();
  const box = person(a, [40, 20, 20, 24], { hair: BLACK });
  const b = frame();
  person(b, [40, 20, 20, 24], { hair: BLOND });
  const score = colorSimilarity(colorSignature(a, box), colorSignature(b, box));
  assert.ok(score > 0.5 && score < 0.7, String(score));
});

test('a darker frame from auto-exposure keeps a light grey shirt light grey', () => {
  const a = frame();
  const box = person(a, [40, 20, 20, 24], { shirt: LIGHT_GRAY });
  const b = darker(a, 0.65);
  assert.ok(frameGain(b) > frameGain(a));
  assert.ok(colorSimilarity(colorSignature(a, box), colorSignature(b, box)) > 0.9);
  // Without the frame's gain the same shirt falls into a darker grey.
  assert.ok(colorSimilarity(colorSignature(a, box, 1), colorSignature(b, box, 1)) < 0.9);
});

test('a hue on a sector border does not jump between bins', () => {
  const a = frame();
  const box = person(a, [40, 20, 20, 24], { shirt: [200, 150, 50] });
  const b = frame();
  person(b, [40, 20, 20, 24], { shirt: [200, 158, 50] });
  assert.ok(colorSimilarity(colorSignature(a, box), colorSignature(b, box)) > 0.9);
});

test('a region out of the frame is null, and a required region must be on both', () => {
  const a = frame();
  const low = person(a, [40, 80, 20, 24]);
  const signature = colorSignature(a, low);
  assert.equal(signature.body, null);
  assert.ok(signature.hair instanceof Float32Array && signature.hair.length === BINS);
  const b = frame();
  const high = person(b, [40, 20, 20, 24]);
  assert.ok(colorSimilarity(signature, colorSignature(b, high)) > 0.9);
  assert.equal(colorSimilarity(signature, colorSignature(b, high), ['body']), null);
  assert.equal(colorSimilarity(null, signature), null);
});

test('a face too far out of the frame has no signature', () => {
  assert.equal(colorSignature(frame(), [500, 500, 20, 24]), null);
});

test('mixColor blends by rate and fills a missing region', () => {
  const a = frame();
  const red = colorSignature(a, person(a, [40, 20, 20, 24], { shirt: RED }));
  const b = frame();
  const blue = colorSignature(b, person(b, [40, 20, 20, 24], { shirt: BLUE }));
  const half = mixColor(red, blue, 0.5);
  const toRed = colorSimilarity(half, red);
  const toBlue = colorSimilarity(half, blue);
  assert.ok(Math.abs(toRed - toBlue) < 1e-6);
  assert.ok(toRed < 1 && toRed > colorSimilarity(red, blue));
  const sum = half.body.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-5);
  const filled = mixColor({ hair: red.hair, body: null }, blue, 0.2);
  assert.equal(filled.body, blue.body);
  assert.equal(mixColor(null, blue, 0.2), blue);
});

test('frameGain stays in its range and leaves a black frame alone', () => {
  assert.equal(frameGain(frame([0, 0, 0])), 1);
  assert.equal(frameGain(frame([255, 255, 255])), 0.6);
  assert.equal(frameGain(frame([10, 10, 10])), 1.8);
});

// A rough face: the points the proportions use, the rest in the middle.
function landmarks({ nose = 0.03, cheeks = 0.18 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (index, x, y, z = 0) => {
    points[index] = { x, y, z };
  };
  set(33, 0.4, 0.4);
  set(263, 0.6, 0.4);
  set(133, 0.46, 0.4);
  set(362, 0.54, 0.4);
  set(129, 0.5 - nose, 0.5);
  set(358, 0.5 + nose, 0.5);
  set(168, 0.5, 0.4);
  set(1, 0.5, 0.52, -0.05);
  set(234, 0.5 - cheeks, 0.45);
  set(454, 0.5 + cheeks, 0.45);
  return points;
}

function transform(points, fn) {
  return points.map(({ x, y, z }) => ({ ...fn(x, y), z }));
}

const square = { width: 1000, height: 1000 };

test('face proportions do not change with distance or a tilted head', () => {
  const base = faceGeometry(landmarks(), square);
  assert.equal(base.length, 5);
  const closer = transform(landmarks(), (x, y) => ({ x: 0.5 + (x - 0.5) * 2, y: 0.5 + (y - 0.5) * 2 }));
  // z is in units of x, so it scales with the face too.
  closer.forEach((point) => {
    point.z *= 2;
  });
  assert.ok(geometryDifference(base, faceGeometry(closer, square)) < 1e-9);
  const angle = (20 * Math.PI) / 180;
  const tilted = transform(landmarks(), (x, y) => ({
    x: 0.5 + (x - 0.5) * Math.cos(angle) - (y - 0.5) * Math.sin(angle),
    y: 0.5 + (x - 0.5) * Math.sin(angle) + (y - 0.5) * Math.cos(angle),
  }));
  assert.ok(geometryDifference(base, faceGeometry(tilted, square)) < 1e-9);
});

// Two of five proportions differ: past geometryMatch in grudges.js, so not recognised as the same.
test('another nose and face width make a clear difference', () => {
  const a = faceGeometry(landmarks(), square);
  const b = faceGeometry(landmarks({ nose: 0.04, cheeks: 0.2 }), square);
  assert.ok(geometryDifference(a, b) > 0.07, String(geometryDifference(a, b)));
  assert.equal(geometryDifference(a, a), 0);
});

test('no geometry without a full set of landmarks', () => {
  assert.equal(faceGeometry([], square), null);
  assert.equal(faceGeometry(null, square), null);
  assert.equal(geometryDifference(null, [1]), null);
  assert.deepEqual(mixGeometry([1, 2], [3, 4], 0.5), [2, 3]);
  assert.deepEqual(mixGeometry(null, [3, 4], 0.5), [3, 4]);
});
