import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detectEmotion } from '../public/js/logic/detectEmotion.js';

const phrases = JSON.parse(readFileSync(new URL('../public/phrases.json', import.meta.url), 'utf8'));

const face = (scores) =>
  Object.entries(scores).map(([categoryName, score]) => ({ categoryName, score }));

const smile = { mouthSmileLeft: 0.8, mouthSmileRight: 0.7 };
const wideEyes = { eyeWideLeft: 0.6, eyeWideRight: 0.6 };
const frown = { browDownLeft: 0.7, browDownRight: 0.6 };

test('smile is happy', () => {
  assert.equal(detectEmotion(face(smile)), 'happy');
});

test('wide eyes with open jaw are surprised', () => {
  assert.equal(detectEmotion(face({ ...wideEyes, jawOpen: 0.6 })), 'surprised');
});

test('wide eyes with raised brows are surprised', () => {
  assert.equal(detectEmotion(face({ ...wideEyes, browInnerUp: 0.7 })), 'surprised');
});

test('lowered brows are angry', () => {
  assert.equal(detectEmotion(face(frown)), 'angry');
});

test('relaxed face is neutral', () => {
  assert.equal(detectEmotion(face({ mouthSmileLeft: 0.1, browDownLeft: 0.1, jawOpen: 0.05 })), 'neutral');
});

test('laugh with open jaw and wide eyes stays happy', () => {
  assert.equal(detectEmotion(face({ ...smile, ...wideEyes, jawOpen: 0.7 })), 'happy');
});

test('smile on one side only is not happy', () => {
  assert.equal(detectEmotion(face({ mouthSmileLeft: 0.7, mouthSmileRight: 0 })), 'neutral');
});

test('open jaw alone, like talking, is not surprise', () => {
  assert.equal(detectEmotion(face({ jawOpen: 0.6 })), 'neutral');
});

test('missing or empty blendshapes are neutral', () => {
  assert.equal(detectEmotion([]), 'neutral');
  assert.equal(detectEmotion(), 'neutral');
});

test('every result has phrases for the cat', () => {
  const inputs = [face(smile), face({ ...wideEyes, jawOpen: 0.6 }), face(frown), []];
  for (const input of inputs) {
    assert.ok(phrases.emotions[detectEmotion(input)]);
  }
});
