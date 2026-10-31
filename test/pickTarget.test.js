import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERSON_MIN_SCORE, TORSO_SHARE, pickTarget, torsoBox } from '../public/js/logic/pickTarget.js';

const person = { kind: 'object', label: 'person', bbox: [100, 100, 300, 600] };
const face = { kind: 'person', emotion: 'happy', bbox: [200, 120, 100, 100] };
const cup = { kind: 'object', label: 'cup', bbox: [150, 400, 60, 60] };
const chair = { kind: 'object', label: 'chair', bbox: [600, 300, 200, 300] };

test('tap on empty space returns null', () => {
  assert.equal(pickTarget({ x: 10, y: 10 }, [person, face, cup, chair]), null);
});

test('tap on a plain object returns it', () => {
  assert.equal(pickTarget({ x: 700, y: 400 }, [person, face, cup, chair]), chair);
});

test('cup held by a person wins over the person', () => {
  assert.equal(pickTarget({ x: 170, y: 420 }, [person, face, cup, chair]), cup);
});

test('tap on a face returns the face with its emotion', () => {
  assert.equal(pickTarget({ x: 250, y: 150 }, [person, face, cup, chair]), face);
});

test('tap on the body resolves to the face of that person, with a torso box', () => {
  const tap = { x: 250, y: 600 };
  assert.deepEqual(pickTarget(tap, [person, face, cup]), { ...face, torsoBox: torsoBox(tap, person.bbox) });
});

test('tap on the face itself carries no torso box', () => {
  assert.equal('torsoBox' in pickTarget({ x: 250, y: 150 }, [person, face]), false);
});

test('torso box is a square around the tap, narrower than the body', () => {
  assert.deepEqual(torsoBox({ x: 250, y: 400 }, person.bbox), [160, 310, 180, 180]);
  assert.equal(TORSO_SHARE, 0.6);
});

test('torso box stays inside the body near its edges', () => {
  const [x, y, width, height] = torsoBox({ x: 101, y: 699 }, person.bbox);
  assert.deepEqual([x, y, width, height], [100, 520, 180, 180]);
  const wide = torsoBox({ x: 500, y: 50 }, [0, 0, 1000, 100]);
  assert.deepEqual(wide, [450, 0, 100, 100]);
});

test('tap on the body ignores a face of someone else', () => {
  const otherFace = { kind: 'person', emotion: 'angry', bbox: [600, 100, 80, 80] };
  const target = pickTarget({ x: 250, y: 600 }, [person, otherFace]);
  assert.equal(target.kind, 'person');
  assert.equal(target.emotion, 'neutral');
});

test('person without a face never becomes an object', () => {
  const target = pickTarget({ x: 250, y: 600 }, [person]);
  assert.deepEqual(target, { kind: 'person', emotion: 'neutral', bbox: person.bbox, torsoBox: torsoBox({ x: 250, y: 600 }, person.bbox) });
});

test('threshold is 0.75', () => {
  assert.equal(PERSON_MIN_SCORE, 0.75);
});

test('weak body without a face is not a person, so the tap goes as an object', () => {
  const figurine = { ...person, score: 0.6 };
  assert.equal(pickTarget({ x: 250, y: 600 }, [figurine]), null);
});

test('confident body without a face stays a neutral person', () => {
  const body = { ...person, score: 0.9 };
  assert.deepEqual(pickTarget({ x: 250, y: 600 }, [body]), {
    kind: 'person',
    emotion: 'neutral',
    bbox: body.bbox,
    torsoBox: torsoBox({ x: 250, y: 600 }, body.bbox),
  });
});

test('body exactly at the threshold is a person', () => {
  const body = { ...person, score: PERSON_MIN_SCORE };
  assert.equal(pickTarget({ x: 250, y: 600 }, [body]).kind, 'person');
});

test('weak body with a face inside still resolves to the face', () => {
  const weak = { ...person, score: 0.3 };
  assert.deepEqual(pickTarget({ x: 250, y: 600 }, [weak, face]), { ...face, torsoBox: torsoBox({ x: 250, y: 600 }, weak.bbox) });
});

test('weak body inside a confident one falls through to the confident one', () => {
  const big = { kind: 'object', label: 'person', bbox: [0, 0, 1000, 1000], score: 0.95 };
  const weak = { ...person, score: 0.4 };
  assert.deepEqual(pickTarget({ x: 250, y: 600 }, [big, weak]), {
    kind: 'person',
    emotion: 'neutral',
    bbox: big.bbox,
    torsoBox: torsoBox({ x: 250, y: 600 }, big.bbox),
  });
});

test('face keeps its track and grudge flags', () => {
  const tracked = { ...face, track: 'face-3', grudged: true };
  const target = pickTarget({ x: 250, y: 150 }, [person, tracked]);
  assert.equal(target.track, 'face-3');
  assert.equal(target.grudged, true);
});

test('tap on the box edge counts as a hit', () => {
  assert.equal(pickTarget({ x: 600, y: 300 }, [chair]), chair);
});

test('no detections returns null', () => {
  assert.equal(pickTarget({ x: 1, y: 1 }, []), null);
});
