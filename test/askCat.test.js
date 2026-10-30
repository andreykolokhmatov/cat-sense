import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASK_TIMEOUT_MS, askBody, askCat } from '../public/js/logic/askCat.js';

const phrases = {
  objects: { cup: { mood: 'want', lines: ['Первая', 'Вторая'] } },
  emotions: { happy: { mood: 'happy', lines: ['Мурр'] } },
  fallback: { mood: 'curious', lines: ['Мяу?'] },
};
const cup = { kind: 'object', label: 'cup', bbox: [0, 0, 10, 10] };
const happyPerson = { kind: 'person', emotion: 'happy', bbox: [0, 0, 10, 10] };
const never = () => new Promise(() => {});

function jsonResponse(data, ok = true) {
  return { ok, json: async () => data };
}

function ask(fetchFn, overrides = {}) {
  return askCat({ target: cup, image: 'abc', phrases, fetchFn, timeoutMs: 10, random: () => 0, ...overrides });
}

test('askBody keeps only kind and emotion for a person, even with an image', () => {
  assert.deepEqual(askBody(happyPerson, 'abc'), { kind: 'person', emotion: 'happy' });
  assert.deepEqual(Object.keys(askBody(happyPerson, null)).sort(), ['emotion', 'kind']);
});

test('askBody sends an object with its image', () => {
  assert.deepEqual(askBody(cup, 'abc'), { kind: 'object', label: 'cup', image: 'abc' });
});

test('askBody gives null for an object without an image', () => {
  assert.equal(askBody(cup, null), null);
});

test('default timeout is 9.5 seconds', () => {
  assert.equal(ASK_TIMEOUT_MS, 9500);
});

test('valid reply is returned and the request is a JSON POST', async () => {
  let call;
  const fetchFn = async (url, options) => {
    call = { url, ...options };
    return jsonResponse({ text: 'Хочу воды!', mood: 'want' });
  };
  assert.deepEqual(await ask(fetchFn), { text: 'Хочу воды!', mood: 'want' });
  assert.equal(call.url, '/api/ask');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.body), { kind: 'object', label: 'cup', image: 'abc' });
});

test('person request goes out without an image', async () => {
  let body;
  const fetchFn = async (_url, options) => {
    body = JSON.parse(options.body);
    return jsonResponse({ text: 'Привет', mood: 'happy' });
  };
  await ask(fetchFn, { target: happyPerson, image: 'abc' });
  assert.deepEqual(body, { kind: 'person', emotion: 'happy' });
});

test('every failed answer falls back to a phrase', async () => {
  const cases = {
    404: async () => jsonResponse({ text: 'нет', mood: 'want' }, false),
    500: async () => jsonResponse({}, false),
    'network reject': async () => {
      throw new TypeError('offline');
    },
    'broken JSON': async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    }),
    'empty text': async () => jsonResponse({ text: '   ', mood: 'want' }),
    'missing text': async () => jsonResponse({ mood: 'want' }),
    'non-string text': async () => jsonResponse({ text: 42, mood: 'want' }),
    'unknown mood': async () => jsonResponse({ text: 'Мяу', mood: 'angry' }),
    'null body': async () => jsonResponse(null),
  };
  for (const [name, fetchFn] of Object.entries(cases)) {
    assert.deepEqual(await ask(fetchFn), { text: 'Первая', mood: 'want' }, name);
  }
});

test('hanging fetch falls back after the timeout', async () => {
  assert.deepEqual(await ask(never), { text: 'Первая', mood: 'want' });
});

test('hanging res.json falls back after the timeout', async () => {
  const fetchFn = async () => ({ ok: true, json: never });
  assert.deepEqual(await ask(fetchFn), { text: 'Первая', mood: 'want' });
});

test('timeout aborts the request', async () => {
  let signal;
  const fetchFn = (_url, options) => {
    signal = options.signal;
    return never();
  };
  await ask(fetchFn);
  assert.equal(signal.aborted, true);
});

test('abort rejecting the fetch after the deadline stays handled', async () => {
  const fetchFn = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  assert.deepEqual(await ask(fetchFn), { text: 'Первая', mood: 'want' });
});

test('object without an image answers without calling fetch', async () => {
  let called = false;
  const fetchFn = async () => {
    called = true;
    return jsonResponse({ text: 'нет', mood: 'want' });
  };
  assert.deepEqual(await ask(fetchFn, { image: null }), { text: 'Первая', mood: 'want' });
  assert.equal(called, false);
});

test('lastText reaches pickPhrase', async () => {
  const fetchFn = async () => jsonResponse({}, false);
  assert.equal((await ask(fetchFn, { lastText: 'Первая' })).text, 'Вторая');
});

test('unknown label uses the fallback phrase', async () => {
  const fetchFn = async () => jsonResponse({}, false);
  const target = { kind: 'object', label: 'unknown', bbox: [0, 0, 10, 10] };
  assert.deepEqual(await ask(fetchFn, { target }), { text: 'Мяу?', mood: 'curious' });
});
