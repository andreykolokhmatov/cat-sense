import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askOutcome, describeTarget, formatSeconds, perfLine, phasesLine } from '../public/js/logic/devLog.js';

const reply = { text: 'Хочу воды!', mood: 'want' };

test('describeTarget names an object Gemini has to recognise', () => {
  assert.equal(describeTarget({ kind: 'object', label: 'unknown' }), 'предмет, название определит Gemini');
  assert.equal(describeTarget({ kind: 'object', label: 'cup' }), 'предмет: cup');
});

test('describeTarget gives the emotion and the grudge of a person', () => {
  assert.equal(describeTarget({ kind: 'person', emotion: 'happy' }), 'человек, эмоция: радость');
  assert.equal(describeTarget({ kind: 'person', emotion: 'angry', grudge: 'start' }), 'человек, эмоция: злость, кот обиделся');
});

test('a 200 with the same text is a real answer', () => {
  const call = { sent: true, status: 200, raw: JSON.stringify(reply) };
  assert.deepEqual(askOutcome(call, reply), { ok: true, mood: 'want' });
});

test('no request means there was no safe crop', () => {
  assert.equal(askOutcome({ sent: false }, reply).ok, false);
  assert.match(askOutcome({ sent: false }, reply).reason, /не отправлен/);
});

test('an abort or a missing status is a timeout', () => {
  assert.match(askOutcome({ sent: true, error: 'AbortError' }, reply).reason, /таймаут/);
  assert.match(askOutcome({ sent: true }, reply).reason, /таймаут/);
});

test('a network error is named', () => {
  assert.match(askOutcome({ sent: true, error: 'TypeError' }, reply).reason, /нет связи.*TypeError/);
});

test('a server error shows the status and the reason in Russian', () => {
  const call = { sent: true, status: 429, raw: '{"error":"too many requests"}' };
  assert.equal(askOutcome(call, reply).reason, 'HTTP 429: лимит запросов');
  assert.equal(askOutcome({ sent: true, status: 500, raw: 'oops' }, reply).reason, 'HTTP 500');
});

test('a 200 whose text the cat did not use failed the check', () => {
  const call = { sent: true, status: 200, raw: '{"text":"","mood":"want"}' };
  assert.match(askOutcome(call, { text: 'Мяу?', mood: 'curious' }).reason, /проверку/);
});

test('perfLine shows the cat view speed, its quality level and the tick costs', () => {
  const line = perfLine({ cat: { fps: 57.6, level: 0 }, tickMs: 63.4, cocoMs: 41, cocoEvery: 1 });
  assert.equal(line, 'зрение 58 к/с (полное) · тик 63 мс · COCO 41 мс');
});

test('perfLine names a lowered level and says how rarely COCO runs', () => {
  const line = perfLine({ cat: { fps: 19, level: 1 }, tickMs: 310, cocoMs: 220, cocoEvery: 3 });
  assert.equal(line, 'зрение 19 к/с (лёгкое) · тик 310 мс · COCO 220 мс каждый 3-й');
});

test('perfLine shows dashes before the first measurements and "выкл" without the cat view', () => {
  assert.equal(perfLine({ cat: { fps: null, level: 0 } }), 'зрение — (полное) · тик — · COCO —');
  assert.equal(perfLine({ cat: null }), 'зрение выкл · тик — · COCO —');
  assert.equal(perfLine(), 'зрение выкл · тик — · COCO —');
});

test('phasesLine shows the crop, the request and the whole way to the text', () => {
  assert.equal(
    phasesLine({ snapMs: 120, askMs: 1380, totalMs: 1680 }),
    'вырезка 0.1 с · запрос 1.4 с · от тапа до текста 1.7 с',
  );
});

test('phasesLine skips what was not measured', () => {
  assert.equal(phasesLine({ totalMs: 800 }), 'от тапа до текста 0.8 с');
  assert.equal(phasesLine({ askMs: undefined }), '');
  assert.equal(phasesLine(), '');
});

test('formatSeconds keeps one decimal', () => {
  assert.equal(formatSeconds(1840), '1.8 с');
});
