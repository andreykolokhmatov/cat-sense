import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { detectEmotion } from '../public/js/logic/detectEmotion.js';
import { EMOTION_LABELS, OBJECT_LABELS } from '../public/js/logic/labels.js';

const phrases = JSON.parse(readFileSync(new URL('../public/phrases.json', import.meta.url), 'utf8'));
const CYRILLIC = /[а-яё]/i;

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
