import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAT_BRIGHTNESS,
  CAT_LOOK,
  CAT_MATRIX,
  DEUTERANOPIA,
  applyMatrix,
  multiply,
  saturationMatrix,
  scale,
} from '../public/js/logic/catVision.js';

const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function pixel(r, g, b, a = 255) {
  return Array.from(applyMatrix(new Uint8ClampedArray([r, g, b, a]), CAT_MATRIX));
}

test('every CAT_MATRIX row sums to CAT_BRIGHTNESS, so grey only gets a little lighter', () => {
  for (const row of CAT_MATRIX) {
    const sum = row.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - CAT_BRIGHTNESS) < 1e-4, `row sum ${sum}`);
  }
});

test('the cat sees most colour as grey: few saturated pixels survive', () => {
  // Spread of the channels, as a share of the brightest one: 0 is grey, 1 is a pure colour.
  const spread = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b, 1);
  for (const colour of [[200, 40, 40], [40, 160, 50], [230, 200, 40]]) {
    const [r, g, b] = pixel(...colour);
    assert.ok(spread([r, g, b]) < spread(colour) * 0.6, `${colour} -> ${r} ${g} ${b}`);
  }
});

test('the haze settings stay in a range that does not wash the picture out', () => {
  assert.ok(CAT_LOOK.contrast > 0.5 && CAT_LOOK.contrast < 1);
  assert.ok(CAT_LOOK.fogAmount > 0 && CAT_LOOK.fogAmount < 0.5);
  assert.equal(CAT_LOOK.fogColor.length, 3);
  assert.ok(CAT_LOOK.fogColor.every((value) => value > 0.5 && value <= 1));
});

test('red and green collapse into one tone', () => {
  const [rr, rg] = pixel(255, 0, 0);
  const [gr, gg] = pixel(0, 255, 0);
  const ratio = rr / rg / (gr / gg);
  assert.ok(ratio > 0.9 && ratio < 1.1, `r/g ratios differ by ${ratio}`);
});

test('blue stays blue', () => {
  const [r, g, b] = pixel(0, 0, 255);
  assert.ok(b > r && b > g, `${r} ${g} ${b}`);
});

test('channels are clipped to 0..255', () => {
  const [r, g, b] = pixel(0, 0, 255);
  assert.equal(r, 0);
  assert.ok(g >= 0 && b <= 255);
  assert.deepEqual(pixel(255, 255, 255).slice(0, 3), [255, 255, 255]);
});

test('alpha is not changed', () => {
  const data = new Uint8ClampedArray([10, 200, 30, 17, 250, 5, 90, 0]);
  applyMatrix(data, CAT_MATRIX);
  assert.equal(data[3], 17);
  assert.equal(data[7], 0);
});

test('multiply by identity keeps the matrix', () => {
  assert.deepEqual(multiply(DEUTERANOPIA, IDENTITY), DEUTERANOPIA);
  assert.deepEqual(multiply(IDENTITY, DEUTERANOPIA), DEUTERANOPIA);
});

test('full saturation is identity and scale multiplies every cell', () => {
  for (const [i, row] of saturationMatrix(1).entries()) {
    for (const [j, value] of row.entries()) assert.ok(Math.abs(value - IDENTITY[i][j]) < 1e-12);
  }
  assert.deepEqual(scale(IDENTITY, 2), [
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 2],
  ]);
});
