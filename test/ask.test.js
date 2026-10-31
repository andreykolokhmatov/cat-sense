import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_JPEG_BASE64 } from '../api/_logo.js';
import {
  GRUDGES,
  HERO_PROMPT,
  HERO_TEXT,
  MAX_IMAGE_CHARS,
  MAX_SEEN_CHARS,
  SCHEMAS,
  SYSTEM_PROMPT,
  createHandler,
  createRateLimiter,
  geminiRequest,
  parseAsk,
  parseReply,
  replyKind,
  thinkingConfig,
  userPrompt,
} from '../api/ask.js';

const cupAsk = { kind: 'object', label: 'cup', image: 'abc=' };
const torsoAsk = { kind: 'person', emotion: 'happy', torso: 'dG9yc28=' };
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

test('parseAsk keeps a known grudge for a person', () => {
  assert.deepEqual(GRUDGES, ['start', 'again']);
  for (const grudge of GRUDGES) {
    assert.deepEqual(parseAsk({ kind: 'person', emotion: 'happy', grudge }), { kind: 'person', emotion: 'happy', grudge });
  }
});

test('parseAsk rejects an unknown grudge', () => {
  for (const grudge of ['yes', true, null, 'START', 1, '', ['start'], 'constructor']) {
    assert.equal(parseAsk({ kind: 'person', emotion: 'happy', grudge }), null, String(grudge));
  }
});

test('parseAsk drops a grudge from an object', () => {
  assert.deepEqual(parseAsk({ ...cupAsk, grudge: 'start' }), cupAsk);
  assert.deepEqual(parseAsk({ ...cupAsk, grudge: 'evil' }), cupAsk);
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
  assert.match(userPrompt({ ...cupAsk, label: 'unknown' }), /в центре картинки/);
  assert.match(userPrompt({ kind: 'person', emotion: 'angry' }), /злость/);
});

test('userPrompt tells the cat it is offended, with the emotion', () => {
  const start = userPrompt({ kind: 'person', emotion: 'angry', grudge: 'start' });
  assert.match(start, /злость/);
  assert.match(start, /обиделся/);
  const again = userPrompt({ kind: 'person', emotion: 'happy', grudge: 'again' });
  assert.match(again, /радость/);
  assert.match(again, /обижен/);
  assert.notEqual(start, again);
  assert.doesNotMatch(userPrompt({ kind: 'person', emotion: 'angry' }), /обид/);
});

test('system prompt keeps the offended cat polite', () => {
  assert.match(SYSTEM_PROMPT, /обиделся/);
  assert.match(SYSTEM_PROMPT, /[Бб]ез грубости и оскорблений/);
  assert.match(SYSTEM_PROMPT, /внешности, теле, возрасте, поле и одежде/);
});

test('geminiRequest sends no image with a grudge', () => {
  const parts = geminiRequest({ kind: 'person', emotion: 'neutral', grudge: 'again' }).contents[0].parts;
  assert.equal(parts.length, 1);
  assert.ok(!JSON.stringify(parts).includes('inlineData'));
});

test('geminiRequest sends the image only for objects', () => {
  const objectParts = geminiRequest(cupAsk).contents[0].parts;
  assert.deepEqual(objectParts[3], { inlineData: { mimeType: 'image/jpeg', data: 'abc=' } });
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
  assert.deepEqual(thinkingConfig('gemini-3.5-flash-lite'), { thinkingLevel: 'low' });
  assert.deepEqual(geminiRequest(cupAsk).generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('thinking level comes from a whitelist and falls back to low', () => {
  assert.deepEqual(thinkingConfig('gemini-3.5-flash-lite', 'medium'), { thinkingLevel: 'medium' });
  assert.deepEqual(thinkingConfig('gemini-3.5-flash-lite', 'MINIMAL'), { thinkingLevel: 'low' });
  assert.deepEqual(thinkingConfig('gemini-3.5-flash-lite', 'evil'), { thinkingLevel: 'low' });
  assert.deepEqual(thinkingConfig('gemini-2.5-flash', 'high'), { thinkingBudget: 0 });
});

test('the logo reference is a small JPEG in base64', () => {
  assert.ok(LOGO_JPEG_BASE64.startsWith('/9j/'));
  assert.ok(LOGO_JPEG_BASE64.length < 40_000);
  assert.match(LOGO_JPEG_BASE64, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('schemas name the object and the confidence before the line', () => {
  assert.deepEqual(SCHEMAS.object.propertyOrdering, ['seen', 'sure', 'logo', 'text', 'mood']);
  assert.deepEqual(SCHEMAS.torso.propertyOrdering, ['logo', 'sure', 'text', 'mood']);
  assert.deepEqual(SCHEMAS.person.propertyOrdering, ['text', 'mood']);
  for (const schema of Object.values(SCHEMAS)) {
    assert.deepEqual(Object.keys(schema.properties), schema.propertyOrdering);
    assert.deepEqual(schema.required, schema.propertyOrdering);
  }
  assert.equal(SCHEMAS.object.properties.logo.type, 'BOOLEAN');
  assert.deepEqual(SCHEMAS.object.properties.sure.enum, ['high', 'low']);
});

test('geminiRequest picks the schema by kind', () => {
  assert.equal(geminiRequest(cupAsk).generationConfig.responseSchema, SCHEMAS.object);
  assert.equal(geminiRequest(torsoAsk).generationConfig.responseSchema, SCHEMAS.torso);
  assert.equal(geminiRequest({ kind: 'person', emotion: 'happy' }).generationConfig.responseSchema, SCHEMAS.person);
});

test('geminiRequest puts the logo reference first and the camera crop after it', () => {
  for (const [ask, photo] of [[cupAsk, 'abc='], [torsoAsk, 'dG9yc28=']]) {
    const parts = geminiRequest(ask).contents[0].parts;
    assert.equal(parts.length, 5);
    assert.match(parts[0].text, /Эталон/);
    assert.equal(parts[1].inlineData.data, LOGO_JPEG_BASE64);
    assert.match(parts[2].text, /с камеры/);
    assert.deepEqual(parts[3], { inlineData: { mimeType: 'image/jpeg', data: photo } });
    assert.equal(parts[4].text, userPrompt(ask));
  }
});

test('replyKind tells object, torso and plain person apart', () => {
  assert.equal(replyKind(cupAsk), 'object');
  assert.equal(replyKind(torsoAsk), 'torso');
  assert.equal(replyKind({ kind: 'person', emotion: 'happy' }), 'person');
});

test('parseAsk keeps hero only when it is literally true, on every kind of ask', () => {
  const grudge = { kind: 'person', emotion: 'happy', grudge: 'start' };
  for (const ask of [cupAsk, torsoAsk, { kind: 'person', emotion: 'happy' }, grudge]) {
    assert.deepEqual(parseAsk({ ...ask, hero: true }), { ...ask, hero: true });
    for (const hero of ['true', 1, false, null, {}, ['true']]) {
      assert.deepEqual(parseAsk({ ...ask, hero }), ask, String(hero));
    }
  }
  assert.deepEqual(parseAsk({ ...grudge, torso: 'dG9yc28=', hero: true }), { ...grudge, hero: true });
  assert.equal(parseAsk({ kind: 'person', emotion: 'evil', hero: true }), null);
});

test('userPrompt adds the superhero instruction only for a masked cat', () => {
  assert.match(HERO_PROMPT, /кот-супергерой/);
  assert.match(HERO_PROMPT, /Арена героев/);
  const asks = [cupAsk, torsoAsk, { kind: 'person', emotion: 'happy' }, { kind: 'person', emotion: 'angry', grudge: 'again' }];
  for (const ask of asks) {
    assert.ok(!userPrompt(ask).includes(HERO_PROMPT));
    assert.ok(!userPrompt({ ...ask, hero: false }).includes(HERO_PROMPT));
    const masked = userPrompt({ ...ask, hero: true });
    assert.ok(masked.startsWith(userPrompt(ask)));
    assert.ok(masked.endsWith(HERO_PROMPT));
  }
  assert.match(userPrompt({ kind: 'person', emotion: 'angry', grudge: 'again', hero: true }), /обижен/);
  assert.ok(!SYSTEM_PROMPT.includes(HERO_PROMPT));
});

test('handler sends the superhero instruction and still gives the fixed line on a sure logo', async () => {
  const calls = [];
  const fetchFn = okFetch({ seen: 'футболка', sure: 'high', logo: true, text: 'Мур', mood: 'want' }, calls);
  const res = await call(createHandler({ fetchFn, env }), { ...cupAsk, hero: true });
  assert.deepEqual(res.body, { text: HERO_TEXT, mood: 'happy', hero: true, sure: 'high', seen: 'футболка' });
  const parts = JSON.parse(calls[0].options.body).contents[0].parts;
  assert.ok(parts.at(-1).text.endsWith(HERO_PROMPT));
});

test('parseAsk keeps a valid torso for a person', () => {
  assert.deepEqual(parseAsk(torsoAsk), torsoAsk);
});

test('parseAsk rejects a broken or oversized torso', () => {
  for (const torso of ['data:image/jpeg;base64,abc', '', 42, null, 'a'.repeat(MAX_IMAGE_CHARS + 1)]) {
    assert.equal(parseAsk({ ...torsoAsk, torso }), null, String(torso).slice(0, 20));
  }
});

test('parseAsk drops the torso with a grudge, even a broken one', () => {
  const grudge = { kind: 'person', emotion: 'happy', grudge: 'again' };
  assert.deepEqual(parseAsk({ ...grudge, torso: 'dG9yc28=' }), grudge);
  assert.deepEqual(parseAsk({ ...grudge, torso: 'not base64!' }), grudge);
});

test('parseAsk ignores a torso on an object', () => {
  assert.deepEqual(parseAsk({ ...cupAsk, torso: 'dG9yc28=' }), cupAsk);
});

test('userPrompt for a torso asks about the logo and keeps the line on the emotion', () => {
  const prompt = userPrompt(torsoAsk);
  assert.match(prompt, /радость/);
  assert.match(prompt, /лого/);
  assert.doesNotMatch(userPrompt({ kind: 'person', emotion: 'happy' }), /лого/);
});

test('system prompt has the confidence, logo and torso rules', () => {
  assert.match(SYSTEM_PROMPT, /ровно в центре/);
  assert.match(SYSTEM_PROMPT, /sure = "low"/);
  assert.match(SYSTEM_PROMPT, /догадка или вопрос/);
  assert.match(SYSTEM_PROMPT, /белая маска/);
  assert.match(SYSTEM_PROMPT, /не упоминай эталон/);
  assert.match(SYSTEM_PROMPT, /символ Бэтмена/);
  assert.match(SYSTEM_PROMPT, /живая кошка/);
  assert.match(SYSTEM_PROMPT, /ни слова об одежде/);
});

test('parseReply sets hero only for a sure logo and swaps in the fixed line', () => {
  const sure = { seen: 'футболка', sure: 'high', logo: true, text: 'Это маска героя!', mood: 'curious' };
  assert.deepEqual(parseReply(geminiData(sure), 'object'), {
    text: HERO_TEXT,
    mood: 'happy',
    hero: true,
    sure: 'high',
    seen: 'футболка',
  });
  assert.equal(HERO_TEXT, 'Маска надета. Арена героев, я с вами!');
  const unsure = parseReply(geminiData({ ...sure, sure: 'low' }), 'object');
  assert.deepEqual(unsure, { text: 'Это маска героя!', mood: 'curious', sure: 'low', seen: 'футболка' });
  const noLogo = parseReply(geminiData({ ...sure, logo: false }), 'object');
  assert.equal(noLogo.hero, undefined);
  assert.equal(parseReply(geminiData({ ...sure, logo: 'true' }), 'object').hero, undefined);
});

test('parseReply gives the hero line even when the model text is unusable', () => {
  const reply = parseReply(geminiData({ logo: true, sure: 'high', text: '', mood: 'sleepy' }), 'torso');
  assert.deepEqual(reply, { text: HERO_TEXT, mood: 'happy', hero: true, sure: 'high' });
});

test('parseReply treats a bad sure as low and drops a long or missing seen', () => {
  const base = { text: 'Мур', mood: 'happy', logo: false };
  assert.deepEqual(parseReply(geminiData({ ...base, sure: 'maybe', seen: 'кружка' }), 'object'), {
    text: 'Мур',
    mood: 'happy',
    sure: 'low',
    seen: 'кружка',
  });
  assert.deepEqual(parseReply(geminiData({ ...base, sure: 'high', seen: 'х'.repeat(MAX_SEEN_CHARS + 1) }), 'object'), {
    text: 'Мур',
    mood: 'happy',
    sure: 'high',
  });
  assert.deepEqual(parseReply(geminiData({ ...base, sure: 'high' }), 'object'), { text: 'Мур', mood: 'happy', sure: 'high' });
});

test('parseReply for a torso has no seen, for a person no extras', () => {
  const reply = { seen: 'кружка', sure: 'high', logo: false, text: 'Мур', mood: 'happy' };
  assert.deepEqual(parseReply(geminiData(reply), 'torso'), { text: 'Мур', mood: 'happy', sure: 'high' });
  assert.deepEqual(parseReply(geminiData({ ...reply, logo: true }), 'person'), { text: 'Мур', mood: 'happy' });
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
  const reply = { seen: 'кружка', sure: 'high', logo: false, text: 'Хочу воды!', mood: 'want' };
  const handler = createHandler({ fetchFn: okFetch(reply, calls), env });
  const res = await call(handler, cupAsk);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { text: 'Хочу воды!', mood: 'want', sure: 'high', seen: 'кружка' });
  assert.match(calls[0].url, /gemini-3\.5-flash-lite:generateContent$/);
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
  assert.equal((await call(handler, { kind: 'person', emotion: 'happy', grudge: 'yes' })).statusCode, 400);
  assert.equal(called, false);
});

test('handler passes a grudge to the model and returns the usual shape', async () => {
  const calls = [];
  const handler = createHandler({ fetchFn: okFetch({ text: 'Я с тобой не разговариваю.', mood: 'scared' }, calls), env });
  const res = await call(handler, { kind: 'person', emotion: 'happy', grudge: 'start' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { text: 'Я с тобой не разговариваю.', mood: 'scared' });
  assert.match(JSON.parse(calls[0].options.body).contents[0].parts[0].text, /обиделся/);
});

test('handler returns hero for a sure logo on a torso and uses GEMINI_THINKING', async () => {
  const calls = [];
  const fetchFn = okFetch({ logo: true, sure: 'high', text: 'Мур', mood: 'want' }, calls);
  const handler = createHandler({ fetchFn, env: { ...env, GEMINI_THINKING: 'medium' } });
  const res = await call(handler, torsoAsk);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { text: HERO_TEXT, mood: 'happy', hero: true, sure: 'high' });
  const sent = JSON.parse(calls[0].options.body);
  assert.deepEqual(sent.generationConfig.thinkingConfig, { thinkingLevel: 'medium' });
  assert.deepEqual(sent.generationConfig.responseSchema, SCHEMAS.torso);
});

test('handler keeps the plain person reply unchanged', async () => {
  const handler = createHandler({ fetchFn: okFetch({ text: 'Мур', mood: 'happy' }), env });
  const res = await call(handler, { kind: 'person', emotion: 'happy' });
  assert.deepEqual(res.body, { text: 'Мур', mood: 'happy' });
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
