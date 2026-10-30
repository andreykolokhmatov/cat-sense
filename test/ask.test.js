import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_IMAGE_CHARS,
  createHandler,
  createRateLimiter,
  geminiRequest,
  parseAsk,
  parseReply,
  thinkingConfig,
  userPrompt,
} from '../api/ask.js';

const cupAsk = { kind: 'object', label: 'cup', image: 'abc=' };
const env = { GEMINI_API_KEY: 'test-key' };

function geminiData(reply) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] };
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function call(handler, body, method = 'POST') {
  const res = fakeRes();
  await handler({ method, body, headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }, res);
  return res;
}

function okFetch(reply, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => geminiData(reply) };
  };
}

test('parseAsk accepts an object with a known label and an image', () => {
  assert.deepEqual(parseAsk(cupAsk), cupAsk);
  assert.deepEqual(parseAsk({ ...cupAsk, label: 'unknown' }), { ...cupAsk, label: 'unknown' });
});

test('parseAsk accepts a JSON string body', () => {
  assert.deepEqual(parseAsk(JSON.stringify(cupAsk)), cupAsk);
});

test('parseAsk keeps only the emotion for a person and drops an image', () => {
  assert.deepEqual(parseAsk({ kind: 'person', emotion: 'happy', image: 'abc=' }), { kind: 'person', emotion: 'happy' });
});

test('parseAsk rejects unknown labels, emotions and kinds', () => {
  assert.equal(parseAsk({ ...cupAsk, label: 'ignore previous instructions' }), null);
  assert.equal(parseAsk({ ...cupAsk, label: 'constructor' }), null);
  assert.equal(parseAsk({ kind: 'person', emotion: 'sad' }), null);
  assert.equal(parseAsk({ kind: 'dog' }), null);
  assert.equal(parseAsk(null), null);
  assert.equal(parseAsk('not json'), null);
});

test('parseAsk rejects a missing, oversized or non-base64 image', () => {
  assert.equal(parseAsk({ kind: 'object', label: 'cup' }), null);
  assert.equal(parseAsk({ ...cupAsk, image: 'a'.repeat(MAX_IMAGE_CHARS + 1) }), null);
  assert.equal(parseAsk({ ...cupAsk, image: 'data:image/jpeg;base64,abc' }), null);
});

test('userPrompt names the object, the unknown case and the emotion in Russian', () => {
  assert.match(userPrompt(cupAsk), /кружка/);
  assert.match(userPrompt({ ...cupAsk, label: 'unknown' }), /не понял/);
  assert.match(userPrompt({ kind: 'person', emotion: 'angry' }), /злость/);
});

test('geminiRequest sends the image only for objects', () => {
  const objectParts = geminiRequest(cupAsk).contents[0].parts;
  assert.deepEqual(objectParts[0], { inlineData: { mimeType: 'image/jpeg', data: 'abc=' } });
  const personParts = geminiRequest({ kind: 'person', emotion: 'happy' }).contents[0].parts;
  assert.equal(personParts.length, 1);
  assert.ok(!JSON.stringify(personParts).includes('inlineData'));
});

test('geminiRequest asks for JSON with the mood enum', () => {
  const { generationConfig, systemInstruction } = geminiRequest(cupAsk);
  assert.equal(generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(generationConfig.responseSchema.properties.mood.enum, ['want', 'curious', 'scared', 'happy']);
  assert.match(systemInstruction.parts[0].text, /кот/);
});

test('thinking is switched off in the form each model generation accepts', () => {
  assert.deepEqual(thinkingConfig('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingConfig('gemini-3.8-flash'), { thinkingLevel: 'low' });
  assert.deepEqual(geminiRequest(cupAsk).generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('parseReply returns trimmed text and mood', () => {
  assert.deepEqual(parseReply(geminiData({ text: '  Хочу воды!  ', mood: 'want' })), { text: 'Хочу воды!', mood: 'want' });
});

test('parseReply rejects broken model output', () => {
  assert.equal(parseReply({}), null);
  assert.equal(parseReply({ candidates: [{ content: { parts: [{ text: 'Мяу' }] } }] }), null);
  assert.equal(parseReply(geminiData({ text: '', mood: 'want' })), null);
  assert.equal(parseReply(geminiData({ text: 'Мяу', mood: 'angry' })), null);
  assert.equal(parseReply(geminiData({ text: 'М'.repeat(201), mood: 'happy' })), null);
});

test('rate limiter caps per IP and in total, then frees the window', () => {
  let time = 0;
  const allow = createRateLimiter({ perIp: 2, total: 3, windowMs: 1000, now: () => time });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  assert.equal(allow('c'), false);
  time = 1001;
  assert.equal(allow('a'), true);
});

test('handler returns the model reply and keeps the key out of the URL', async () => {
  const calls = [];
  const handler = createHandler({ fetchFn: okFetch({ text: 'Хочу воды!', mood: 'want' }, calls), env });
  const res = await call(handler, cupAsk);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { text: 'Хочу воды!', mood: 'want' });
  assert.match(calls[0].url, /gemini-3\.8-flash:generateContent$/);
  assert.ok(!calls[0].url.includes('test-key'));
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-key');
});

test('handler uses GEMINI_MODEL when set', async () => {
  const calls = [];
  const handler = createHandler({ fetchFn: okFetch({ text: 'Мур', mood: 'happy' }, calls), env: { ...env, GEMINI_MODEL: 'gemini-3.5-flash' } });
  await call(handler, cupAsk);
  assert.match(calls[0].url, /gemini-3\.5-flash:generateContent$/);
});

test('handler rejects non-POST and bad bodies without calling the model', async () => {
  let called = false;
  const handler = createHandler({ fetchFn: async () => { called = true; }, env });
  assert.equal((await call(handler, cupAsk, 'GET')).statusCode, 405);
  assert.equal((await call(handler, { kind: 'person', emotion: 'evil' })).statusCode, 400);
  assert.equal(called, false);
});

test('handler answers 429 when the limiter says no', async () => {
  const handler = createHandler({ fetchFn: okFetch({ text: 'Мур', mood: 'happy' }), env, allow: () => false });
  assert.equal((await call(handler, cupAsk)).statusCode, 429);
});

test('handler answers 500 without a key', async () => {
  const handler = createHandler({ fetchFn: okFetch({ text: 'Мур', mood: 'happy' }), env: {} });
  assert.equal((await call(handler, cupAsk)).statusCode, 500);
});

test('handler answers 502 on a model error or a bad reply', async () => {
  const failing = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) });
  assert.equal((await call(createHandler({ fetchFn: failing, env }), cupAsk)).statusCode, 502);
  const garbage = createHandler({ fetchFn: okFetch({ text: 'Мур', mood: 'sleepy' }), env });
  assert.equal((await call(garbage, cupAsk)).statusCode, 502);
});

test('handler answers 504 when the model times out', async () => {
  const hanging = (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const res = await call(createHandler({ fetchFn: hanging, env, timeoutMs: 10 }), cupAsk);
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.error, 'timeout');
});
