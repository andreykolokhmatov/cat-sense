import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detectEmotion } from '../public/js/logic/detectEmotion.js';
import { captionOf, EMOTION_LABELS, OBJECT_LABELS } from '../public/js/logic/labels.js';

const phrases = JSON.parse(readFileSync(new URL('../public/phrases.json', import.meta.url), 'utf8'));
const CYRILLIC = /[а-яё]/i;

test('object caption is in Russian', () => {
  assert.equal(captionOf({ kind: 'object', label: 'cell phone', bbox: [0, 0, 1, 1] }), 'телефон');
  assert.equal(captionOf({ kind: 'object', label: 'cup', bbox: [0, 0, 1, 1] }), 'кружка');
});

test('person caption is the emotion in Russian', () => {
  assert.equal(captionOf({ kind: 'person', emotion: 'angry', bbox: [0, 0, 1, 1] }), 'злость');
});

test('unknown values fall back to the original text', () => {
  assert.equal(captionOf({ kind: 'object', label: 'spaceship' }), 'spaceship');
  assert.equal(captionOf({ kind: 'person', emotion: 'bored' }), 'bored');
});

test('all 80 COCO classes are translated', () => {
  assert.equal(Object.keys(OBJECT_LABELS).length, 80);
  assert.ok(Object.values(OBJECT_LABELS).every((label) => CYRILLIC.test(label)));
});

test('every phrase object has a Russian caption', () => {
  for (const label of Object.keys(phrases.objects)) {
    assert.ok(OBJECT_LABELS[label], `no caption for ${label}`);
  }
});

test('every emotion the detector can return has a Russian caption', () => {
  assert.deepEqual(Object.keys(EMOTION_LABELS).sort(), Object.keys(phrases.emotions).sort());
  assert.ok(EMOTION_LABELS[detectEmotion([])]);
});
