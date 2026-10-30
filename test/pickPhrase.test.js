import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GRUDGES, MOODS, pickPhrase } from '../public/js/logic/pickPhrase.js';

const phrases = JSON.parse(readFileSync(new URL('../public/phrases.json', import.meta.url), 'utf8'));

const allEntries = [
  ...Object.values(phrases.objects),
  ...Object.values(phrases.emotions),
  ...Object.values(phrases.grudge),
  phrases.fallback,
];

test('known object returns one of its own lines and its mood', () => {
  const { text, mood } = pickPhrase(phrases, { kind: 'object', label: 'cup' });
  assert.ok(phrases.objects.cup.lines.includes(text));
  assert.equal(mood, 'want');
});

test('person returns a line for the detected emotion', () => {
  const { text, mood } = pickPhrase(phrases, { kind: 'person', emotion: 'angry' });
  assert.ok(phrases.emotions.angry.lines.includes(text));
  assert.equal(mood, 'scared');
});

test('unknown object and unknown emotion use the fallback', () => {
  for (const target of [
    { kind: 'object', label: 'spaceship' },
    { kind: 'person', emotion: 'bored' },
    { kind: 'object' },
  ]) {
    const { text, mood } = pickPhrase(phrases, target);
    assert.ok(phrases.fallback.lines.includes(text));
    assert.equal(mood, phrases.fallback.mood);
  }
});

test('person with a grudge gets a grudge line', () => {
  for (const grudge of GRUDGES) {
    const { text, mood } = pickPhrase(phrases, { kind: 'person', emotion: 'happy', grudge });
    assert.ok(phrases.grudge[grudge].lines.includes(text), grudge);
    assert.equal(mood, 'scared');
  }
});

test('grudge without grudge phrases falls back to the emotion, then to the fallback', () => {
  const noGrudge = { ...phrases, grudge: undefined };
  const { text } = pickPhrase(noGrudge, { kind: 'person', emotion: 'angry', grudge: 'again' });
  assert.ok(phrases.emotions.angry.lines.includes(text));
  const fallback = pickPhrase(noGrudge, { kind: 'person', emotion: 'bored', grudge: 'start' });
  assert.ok(phrases.fallback.lines.includes(fallback.text));
});

test('an unknown grudge is ignored', () => {
  const { text } = pickPhrase(phrases, { kind: 'person', emotion: 'angry', grudge: 'constructor' });
  assert.ok(phrases.emotions.angry.lines.includes(text));
});

test('a grudge on an object is ignored', () => {
  const { text } = pickPhrase(phrases, { kind: 'object', label: 'cup', grudge: 'start' });
  assert.ok(phrases.objects.cup.lines.includes(text));
});

test('both grudge lists exist and are written', () => {
  assert.deepEqual(Object.keys(phrases.grudge).sort(), [...GRUDGES].sort());
});

test('never repeats the previous line', () => {
  const target = { kind: 'object', label: 'cup' };
  for (const lastText of phrases.objects.cup.lines) {
    for (const value of [0, 0.5, 0.999]) {
      const { text } = pickPhrase(phrases, target, lastText, () => value);
      assert.notEqual(text, lastText);
    }
  }
});

test('single-line entry still answers when that line was the last one', () => {
  const single = { objects: { cup: { mood: 'want', lines: ['Мяу'] } }, emotions: {}, fallback: phrases.fallback };
  const { text } = pickPhrase(single, { kind: 'object', label: 'cup' }, 'Мяу');
  assert.equal(text, 'Мяу');
});

test('every entry has a known mood and non-empty unique lines', () => {
  for (const { mood, lines } of allEntries) {
    assert.ok(MOODS.includes(mood), `unknown mood: ${mood}`);
    assert.ok(lines.length > 0);
    assert.equal(new Set(lines).size, lines.length);
    assert.ok(lines.every((line) => line.trim().length > 0));
  }
});

test('all four emotions from the detection rules are covered', () => {
  assert.deepEqual(Object.keys(phrases.emotions).sort(), ['angry', 'happy', 'neutral', 'surprised']);
});
