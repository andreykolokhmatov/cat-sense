import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HERO_MS, HERO_OFF, HERO_TAPS, heroStep, isMasked } from '../public/js/logic/heroMask.js';

const on = (now = 0) => heroStep(HERO_OFF, { type: 'hero', now });

test('the mask lasts 3 answers or 30 seconds', () => {
  assert.equal(HERO_TAPS, 3);
  assert.equal(HERO_MS, 30000);
});

test('a hero answer puts the mask on', () => {
  assert.equal(isMasked(HERO_OFF, 0), false);
  assert.equal(isMasked(on(), 1), true);
});

test('the mask stays through the further answers and comes off with the last one', () => {
  let state = on();
  for (let tap = 1; tap < HERO_TAPS; tap += 1) {
    state = heroStep(state, { type: 'tap', now: tap });
    assert.equal(isMasked(state, tap), true, `after answer ${tap}`);
  }
  state = heroStep(state, { type: 'tap', now: HERO_TAPS });
  assert.equal(isMasked(state, HERO_TAPS), false);
});

test('the mask comes off when its time is up, even without taps', () => {
  const state = on(1000);
  assert.equal(heroStep(state, { type: 'tick', now: 1000 + HERO_MS - 1 }).on, true);
  assert.equal(heroStep(state, { type: 'tick', now: 1000 + HERO_MS }).on, false);
  assert.equal(isMasked(state, 1000 + HERO_MS), false);
});

test('a late answer after the time is up does not count as a masked one', () => {
  assert.deepEqual(heroStep(on(0), { type: 'tap', now: HERO_MS + 5 }), HERO_OFF);
});

test('another hero answer restarts both the taps and the time', () => {
  let state = heroStep(on(0), { type: 'tap', now: 10 });
  state = heroStep(state, { type: 'tap', now: 20 });
  state = heroStep(state, { type: 'hero', now: 20000 });
  assert.deepEqual(state, { on: true, tapsLeft: HERO_TAPS, until: 20000 + HERO_MS });
  assert.equal(isMasked(state, 20000 + HERO_MS - 1), true);
});

test('taps and ticks without the mask change nothing', () => {
  assert.equal(heroStep(HERO_OFF, { type: 'tap', now: 5 }), HERO_OFF);
  assert.equal(heroStep(HERO_OFF, { type: 'tick', now: 5 }), HERO_OFF);
});
