import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATE_SIDE, logoStats, mayHoldLogo } from '../public/js/logic/logoGate.js';

const BLACK = [18, 18, 22];
const WHITE = [240, 240, 236];

function picture(background, patch = null, share = 0) {
  const pixels = GATE_SIDE * GATE_SIDE;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const patchPixels = Math.round(pixels * share);
  for (let index = 0; index < pixels; index += 1) {
    const [r, g, b] = index < patchPixels ? patch : background;
    rgba.set([r, g, b, 255], index * 4);
  }
  return rgba;
}

const gate = (...args) => mayHoldLogo(logoStats(picture(...args)));

test('plain black shirt does not pass', () => {
  assert.equal(gate(BLACK), false);
});

test('plain white and light shirts do not pass', () => {
  assert.equal(gate(WHITE), false);
  assert.equal(gate([200, 200, 205]), false);
  assert.equal(gate([235, 220, 190]), false);
});

test('white mask on a black shirt passes', () => {
  assert.equal(gate(BLACK, WHITE, 0.15), true);
  assert.equal(gate(BLACK, WHITE, 0.05), true);
  assert.equal(gate(BLACK, WHITE, 0.4), true);
});

test('yellowish white under warm light still counts as the print', () => {
  assert.equal(gate(BLACK, [235, 215, 185], 0.15), true);
});

test('a speck or a mostly white picture does not pass', () => {
  assert.equal(gate(BLACK, WHITE, 0.01), false);
  assert.equal(gate(BLACK, WHITE, 0.6), false);
});

test('white print on a coloured shirt does not pass', () => {
  assert.equal(gate([110, 50, 160], WHITE, 0.15), false);
  assert.equal(gate([200, 40, 40], WHITE, 0.15), false);
});

test('skin and a dark shirt with a coloured print do not pass', () => {
  assert.equal(gate([224, 172, 140]), false);
  assert.equal(gate(BLACK, [220, 60, 60], 0.2), false);
});

test('empty pixels give zero shares', () => {
  assert.deepEqual(logoStats(new Uint8ClampedArray(0)), { white: 0, dark: 0 });
});
