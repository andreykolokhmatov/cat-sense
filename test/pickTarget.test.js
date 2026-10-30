import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickTarget } from '../public/js/logic/pickTarget.js';

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

test('tap on the body resolves to the face of that person', () => {
  assert.equal(pickTarget({ x: 250, y: 600 }, [person, face, cup]), face);
});

test('tap on the body ignores a face of someone else', () => {
  const otherFace = { kind: 'person', emotion: 'angry', bbox: [600, 100, 80, 80] };
  const target = pickTarget({ x: 250, y: 600 }, [person, otherFace]);
  assert.equal(target.kind, 'person');
  assert.equal(target.emotion, 'neutral');
});

test('person without a face never becomes an object', () => {
  const target = pickTarget({ x: 250, y: 600 }, [person]);
  assert.deepEqual(target, { kind: 'person', emotion: 'neutral', bbox: person.bbox });
});

test('tap on the box edge counts as a hit', () => {
  assert.equal(pickTarget({ x: 600, y: 300 }, [chair]), chair);
});

test('no detections returns null', () => {
  assert.equal(pickTarget({ x: 1, y: 1 }, []), null);
});
