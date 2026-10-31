import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BINS } from '../public/js/logic/appearance.js';
import { GRUDGE_TUNING, createGrudges } from '../public/js/logic/grudges.js';
import { createTracker } from '../public/js/logic/tracker.js';

const CYCLE_MS = 250;

function histogram(weights) {
  const values = new Float32Array(BINS);
  for (const [bin, weight] of Object.entries(weights)) values[bin] = weight;
  return values;
}

// Looks as the camera would give them: bin 0 is dark, 5 a red, 13 a blue, 9 a yellow.
const DAD = {
  color: { hair: histogram({ 0: 1 }), body: histogram({ 5: 0.9, 0: 0.1 }) },
  geometry: [0.4, 0.3, 0.45, 0.62, 1.5],
};
const SISTER = {
  color: { hair: histogram({ 0: 1 }), body: histogram({ 13: 0.9, 0: 0.1 }) },
  geometry: [0.42, 0.33, 0.47, 0.6, 1.42],
};
// Dad's shirt and hair on a clearly different face (a child's proportions, ~11% off). The
// sister's face is only ~5% off dad's: that close, the colours have to tell them apart.
const DAD_COLOURS_OTHER_FACE = { color: DAD.color, geometry: [0.36, 0.26, 0.4, 0.68, 1.62] };
// Dad in another frame: a little noise in the colours and the proportions.
const DAD_AGAIN = {
  color: { hair: histogram({ 0: 0.95, 1: 0.05 }), body: histogram({ 5: 0.8, 0: 0.15, 4: 0.05 }) },
  geometry: [0.405, 0.298, 0.452, 0.618, 1.51],
};
// A doubtful frame of dad: motion blur mixed the shirt with the wall.
const DAD_BLURRED = {
  color: { hair: histogram({ 0: 0.7, 1: 0.3 }), body: histogram({ 5: 0.3, 1: 0.7 }) },
  geometry: DAD.geometry,
};

const CENTRE = [400, 300, 200, 240];
const LEFT = [100, 300, 200, 240];
const RIGHT = [760, 300, 200, 240];

// One detection cycle through the real tracker, as detect.js runs it.
function scene() {
  const tracker = createTracker({ prefix: 'face-' });
  const grudges = createGrudges();
  let now = 0;
  function cycle(people) {
    now += CYCLE_MS;
    const ids = tracker.update(people.map(({ box }) => box));
    const tracks = tracker.tracks();
    const faces = people.map(({ look }, i) => ({ track: ids[i], gap: tracks.find((t) => t.id === ids[i]).gap, ...look }));
    const events = grudges.update(faces, now);
    return { ids, events, offenders: ids.map((id) => grudges.isOffender(id)) };
  }
  function wait(ms) {
    now += ms;
  }
  return { tracker, grudges, cycle, wait, now: () => now };
}

function startOn(s, box, look) {
  const { ids } = s.cycle([{ box, look }]);
  s.grudges.start({ track: ids[0], ...look }, s.now());
  return ids[0];
}

test('the grudge stays on the offender while they are in view', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  for (const dx of [10, 25, 40, 30]) {
    const { offenders, events } = s.cycle([{ box: [400 + dx, 300, 200, 240], look: DAD_AGAIN }]);
    assert.deepEqual(offenders, [true]);
    assert.deepEqual(events, []);
  }
});

// The bug from the phone, fast: the camera jumps from dad to the sister in one cycle and the
// tracker hands her dad's id.
test('a fast turn to someone else takes the mark off at once', () => {
  const s = scene();
  const dad = startOn(s, CENTRE, DAD);
  const first = s.cycle([{ box: [390, 295, 190, 230], look: SISTER }]);
  assert.equal(first.ids[0], dad);
  assert.deepEqual(first.offenders, [false]);
  for (let i = 0; i < 5; i += 1) assert.deepEqual(s.cycle([{ box: [390, 295, 190, 230], look: SISTER }]).offenders, [false]);
});

// The bug from the phone, slow: dad leaves, the sister is framed where he was.
test('someone framed where the offender was does not get the mark', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  s.cycle([]);
  s.cycle([]);
  s.cycle([]);
  for (let i = 0; i < 8; i += 1) assert.deepEqual(s.cycle([{ box: CENTRE, look: SISTER }]).offenders, [false]);
});

test('the sister slid over the place dad left keeps her own id and no mark', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  s.cycle([]);
  const results = [RIGHT, [600, 300, 200, 240], [500, 300, 200, 240], CENTRE].map((box) => s.cycle([{ box, look: SISTER }]));
  assert.ok(results.every(({ offenders }) => offenders[0] === false));
});

test('the offender back on a new id is recognised after a few cycles, with a back event', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  // The camera turns to the sister for a while.
  for (let i = 0; i < 12; i += 1) assert.deepEqual(s.cycle([{ box: RIGHT, look: SISTER }]).offenders, [false]);
  s.wait(5000);
  const seen = [];
  for (let i = 0; i < GRUDGE_TUNING.reidCycles; i += 1) seen.push(s.cycle([{ box: LEFT, look: DAD_AGAIN }]));
  assert.deepEqual(
    seen.map(({ offenders }) => offenders[0]),
    [...Array(GRUDGE_TUNING.reidCycles - 1).fill(false), true],
  );
  const [event] = seen.at(-1).events;
  assert.equal(event.type, 'back');
  assert.equal(event.track, seen.at(-1).ids[0]);
  assert.ok(event.awayMs > 5000);
  assert.deepEqual(s.cycle([{ box: LEFT, look: DAD_AGAIN }]).events, []);
});

test('the offender back on the old id after a gap is checked strictly and welcomed back', () => {
  const s = scene();
  const dad = startOn(s, CENTRE, DAD);
  for (let i = 0; i < 4; i += 1) s.cycle([]);
  const back = s.cycle([{ box: CENTRE, look: DAD_AGAIN }]);
  assert.equal(back.ids[0], dad);
  assert.deepEqual(back.offenders, [true]);
  assert.equal(back.events[0]?.type, 'back');
});

test('a short dropout keeps the mark and says nothing', () => {
  const s = scene();
  const dad = startOn(s, CENTRE, DAD);
  s.cycle([]);
  assert.equal(s.grudges.isOffender(dad), true);
  s.cycle([]);
  assert.equal(s.grudges.isOffender(dad), true);
  const back = s.cycle([{ box: CENTRE, look: DAD_AGAIN }]);
  assert.deepEqual(back.offenders, [true]);
  assert.deepEqual(back.events, []);
});

test('one doubtful frame hides the mark, a good one brings it back quietly', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  assert.deepEqual(s.cycle([{ box: CENTRE, look: DAD_BLURRED }]).offenders, [false]);
  const next = s.cycle([{ box: CENTRE, look: DAD_AGAIN }]);
  assert.deepEqual(next.offenders, [true]);
  assert.deepEqual(next.events, []);
});

test('two doubtful frames in a row let the id go', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  s.cycle([{ box: CENTRE, look: DAD_BLURRED }]);
  s.cycle([{ box: CENTRE, look: DAD_BLURRED }]);
  // Now only a strict match brings the mark back, after reidCycles.
  assert.deepEqual(s.cycle([{ box: CENTRE, look: DAD_AGAIN }]).offenders, [false]);
});

test('two look-alikes in view: the cat does not guess', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  for (let i = 0; i < 12; i += 1) s.cycle([]);
  for (let i = 0; i < 6; i += 1) {
    const { offenders } = s.cycle([
      { box: LEFT, look: DAD_AGAIN },
      { box: RIGHT, look: DAD },
    ]);
    assert.deepEqual(offenders, [false, false]);
  }
});

test('the same clothes on another face are not the offender', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  for (let i = 0; i < 12; i += 1) s.cycle([]);
  for (let i = 0; i < 6; i += 1) assert.deepEqual(s.cycle([{ box: LEFT, look: DAD_COLOURS_OTHER_FACE }]).offenders, [false]);
});

test('after the memory time the cat forgets', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  for (let i = 0; i < 12; i += 1) s.cycle([]);
  s.wait(GRUDGE_TUNING.memoryMs);
  for (let i = 0; i < 5; i += 1) assert.deepEqual(s.cycle([{ box: LEFT, look: DAD_AGAIN }]).offenders, [false]);
  assert.equal(s.grudges.count(), 0);
});

test('forgiving drops the grudge for good', () => {
  const s = scene();
  const dad = startOn(s, CENTRE, DAD);
  assert.equal(s.grudges.forgive('face-999'), false);
  assert.equal(s.grudges.forgive(dad), true);
  assert.equal(s.grudges.isOffender(dad), false);
  assert.equal(s.grudges.active(), false);
  for (let i = 0; i < 12; i += 1) s.cycle([]);
  for (let i = 0; i < 5; i += 1) assert.deepEqual(s.cycle([{ box: LEFT, look: DAD_AGAIN }]).offenders, [false]);
});

test('after the tracker starts over the cat still recognises the offender', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  s.tracker.reset();
  s.grudges.detach();
  const seen = [];
  for (let i = 0; i < GRUDGE_TUNING.reidCycles; i += 1) seen.push(s.cycle([{ box: CENTRE, look: DAD_AGAIN }]));
  assert.equal(seen.at(-1).offenders[0], true);
  assert.equal(seen.at(-1).events[0]?.type, 'back');
});

test('a hold on someone the cat remembers renews that grudge, no twin', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  for (let i = 0; i < 12; i += 1) s.cycle([]);
  const { ids } = s.cycle([{ box: LEFT, look: DAD_AGAIN }]);
  s.grudges.start({ track: ids[0], ...DAD_AGAIN }, s.now());
  assert.equal(s.grudges.count(), 1);
  assert.equal(s.grudges.isOffender(ids[0]), true);
});

test('at most three offenders: the oldest is dropped', () => {
  const grudges = createGrudges();
  for (const track of ['a', 'b', 'c', 'd']) grudges.start({ track, ...DAD }, 0);
  assert.equal(grudges.count(), 3);
  assert.equal(grudges.isOffender('a'), false);
  assert.equal(grudges.isOffender('d'), true);
});

test('without colours the grudge holds while the face never leaves, then learns them', () => {
  const s = scene();
  const { ids } = s.cycle([{ box: CENTRE, look: DAD }]);
  s.grudges.start({ track: ids[0], color: null, geometry: DAD.geometry }, s.now());
  assert.deepEqual(s.cycle([{ box: CENTRE, look: DAD_AGAIN }]).offenders, [true]);
  // The colours learned from that frame now catch a switch to the sister.
  s.cycle([{ box: CENTRE, look: SISTER }]);
  assert.deepEqual(s.cycle([{ box: CENTRE, look: SISTER }]).offenders, [false]);
});

test('likeness shows how close a face is to an offender, for the developer mode', () => {
  const s = scene();
  startOn(s, CENTRE, DAD);
  const { ids } = s.cycle([
    { box: CENTRE, look: DAD_AGAIN },
    { box: RIGHT, look: SISTER },
  ]);
  assert.ok(s.grudges.likeness(ids[0]).color > s.grudges.likeness(ids[1]).color);
  assert.equal(s.grudges.likeness('face-999'), null);
});
