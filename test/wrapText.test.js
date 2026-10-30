import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wrapText } from '../public/js/logic/wrapText.js';

// One unit per code point keeps the expected lines easy to read.
const measure = (text) => Array.from(text).length;

test('short text stays on one line', () => {
  assert.deepEqual(wrapText('Хочу воды!', 20, measure), ['Хочу воды!']);
});

test('wraps by words', () => {
  assert.deepEqual(wrapText('мяу мяу мяу мяу', 7, measure), ['мяу мяу', 'мяу мяу']);
});

test('a word longer than the line is cut by characters', () => {
  assert.deepEqual(wrapText('ой Мяяяяяяяяяу', 5, measure), ['ой', 'Мяяяя', 'яяяяя', 'у']);
});

test('extra lines are cut and the last one ends with an ellipsis', () => {
  const lines = wrapText('один два три четыре пять', 9, measure, 2);
  assert.deepEqual(lines, ['один два', 'три…']);
  assert.ok(lines.every((line) => measure(line) <= 9));
});

test('the ellipsis fits even when the last kept line is full', () => {
  assert.deepEqual(wrapText('абвгд ежзий', 5, measure, 1), ['абвг…']);
});

test('empty text gives no lines', () => {
  assert.deepEqual(wrapText('', 10, measure), []);
  assert.deepEqual(wrapText('   ', 10, measure), []);
});

test('emoji are not split in half', () => {
  const lines = wrapText('😺😺😺😺', 3, measure);
  assert.deepEqual(lines, ['😺😺😺', '😺']);
});
