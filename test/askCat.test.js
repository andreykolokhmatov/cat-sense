import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASK_TIMEOUT_MS, askBody, askCat } from '../public/js/logic/askCat.js';

const phrases = {
  objects: { cup: { mood: 'want', lines: ['Первая', 'Вторая'] } },
  emotions: { happy: { mood: 'happy', lines: ['Мурр'] } },
  grudge: { start: { mood: 'scared', lines: ['Обиделся'] }, again: { mood: 'scared', lines: ['Всё ещё обижен'] } },
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

test('askBody sends a grudge only from the list', () => {
  for (const grudge of ['start', 'again']) {
    assert.deepEqual(askBody({ ...happyPerson, grudge }, null), { kind: 'person', emotion: 'happy', grudge });
  }
  for (const grudge of ['yes', 'START', true, 1, null, undefined]) {
    assert.deepEqual(askBody({ ...happyPerson, grudge }, null), { kind: 'person', emotion: 'happy' });
  }
});

test('askBody never sends the box, the track or the grudge flag', () => {
  const tracked = { ...happyPerson, track: 'face-1', grudged: true, grudge: 'again' };
  assert.deepEqual(Object.keys(askBody(tracked, 'abc')).sort(), ['emotion', 'grudge', 'kind']);
});

test('askBody drops a grudge on an object', () => {
  assert.deepEqual(askBody({ ...cup, grudge: 'start' }, 'abc'), { kind: 'object', label: 'cup', image: 'abc' });
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

test('offline grudge falls back to the grudge phrase', async () => {
  const fetchFn = async () => {
    throw new TypeError('offline');
  };
  const again = { ...happyPerson, track: 'face-1', grudged: true, grudge: 'again' };
  assert.deepEqual(await ask(fetchFn, { target: again }), { text: 'Всё ещё обижен', mood: 'scared' });
  const start = { ...happyPerson, grudge: 'start' };
  assert.deepEqual(await ask(fetchFn, { target: start }), { text: 'Обиделся', mood: 'scared' });
});

test('grudge request carries the grudge and no image', async () => {
  let body;
  const fetchFn = async (_url, options) => {
    body = JSON.parse(options.body);
    return jsonResponse({ text: 'Фыр', mood: 'scared' });
  };
  await ask(fetchFn, { target: { ...happyPerson, track: 'face-1', grudge: 'start' }, image: 'abc' });
  assert.deepEqual(body, { kind: 'person', emotion: 'happy', grudge: 'start' });
});

test('unknown label uses the fallback phrase', async () => {
  const fetchFn = async () => jsonResponse({}, false);
  const target = { kind: 'object', label: 'unknown', bbox: [0, 0, 10, 10] };
  assert.deepEqual(await ask(fetchFn, { target }), { text: 'Мяу?', mood: 'curious' });
});

test('askBody sends a torso for a person without a grudge', () => {
  assert.deepEqual(askBody(happyPerson, null, { torso: 'xyz' }), { kind: 'person', emotion: 'happy', torso: 'xyz' });
});

test('askBody never sends a torso with any grudge', () => {
  for (const grudge of ['start', 'again', 'yes', true, 0]) {
    assert.equal('torso' in askBody({ ...happyPerson, grudge }, null, { torso: 'xyz' }), false, String(grudge));
  }
});

test('askBody ignores an empty or non-string torso and never puts it on an object', () => {
  for (const torso of ['', null, undefined, 42]) {
    assert.deepEqual(askBody(happyPerson, null, { torso }), { kind: 'person', emotion: 'happy' });
  }
  assert.deepEqual(askBody(cup, 'abc', { torso: 'xyz' }), { kind: 'object', label: 'cup', image: 'abc' });
});

test('askBody marks every kind of request in the mask with hero: true, and only then', () => {
  assert.deepEqual(askBody(cup, 'abc', { hero: true }), { kind: 'object', label: 'cup', image: 'abc', hero: true });
  assert.deepEqual(askBody(happyPerson, null, { hero: true }), { kind: 'person', emotion: 'happy', hero: true });
  assert.deepEqual(askBody({ ...happyPerson, grudge: 'start' }, null, { hero: true, torso: 'xyz' }), {
    kind: 'person',
    emotion: 'happy',
    grudge: 'start',
    hero: true,
  });
  assert.deepEqual(askBody(happyPerson, null, { hero: true, torso: 'xyz' }), {
    kind: 'person',
    emotion: 'happy',
    torso: 'xyz',
    hero: true,
  });
  for (const hero of [false, undefined, 'true', 1]) {
    assert.equal('hero' in askBody(cup, 'abc', { hero }), false, String(hero));
  }
  assert.equal(askBody(cup, null, { hero: true }), null);
});

test('askCat sends the torso and the hero flag it was given', async () => {
  let body;
  const fetchFn = async (_url, options) => {
    body = JSON.parse(options.body);
    return jsonResponse({ text: 'Привет', mood: 'happy' });
  };
  await ask(fetchFn, { target: happyPerson, image: 'abc', torso: 'xyz', hero: true });
  assert.deepEqual(body, { kind: 'person', emotion: 'happy', torso: 'xyz', hero: true });
  await ask(fetchFn, { target: happyPerson, torso: 'xyz' });
  assert.deepEqual(body, { kind: 'person', emotion: 'happy', torso: 'xyz' });
});

test('hero reply keeps hero: true, anything but true is dropped', async () => {
  const hero = await ask(async () => jsonResponse({ text: 'Маска надета.', mood: 'happy', hero: true, seen: 'лого', sure: 'high' }));
  assert.deepEqual(hero, { text: 'Маска надета.', mood: 'happy', hero: true });
  for (const flag of [false, 'true', 1, null]) {
    const reply = await ask(async () => jsonResponse({ text: 'Мяу', mood: 'happy', hero: flag }));
    assert.deepEqual(reply, { text: 'Мяу', mood: 'happy' }, String(flag));
  }
});

test('a hero reply with a broken text falls back without the mask', async () => {
  const reply = await ask(async () => jsonResponse({ text: '', mood: 'happy', hero: true }));
  assert.deepEqual(reply, { text: 'Первая', mood: 'want' });
});
