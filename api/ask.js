import { EMOTION_LABELS, OBJECT_LABELS } from '../public/js/logic/labels.js';
import { MOODS } from '../public/js/logic/pickPhrase.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// The phone gives up after 6 s and the upload eats part of that, so the model gets less.
export const GEMINI_TIMEOUT_MS = 4500;
// A 512 px JPEG crop is ~100 KB in base64; anything far bigger is not from our page.
export const MAX_IMAGE_CHARS = 400_000;
export const MAX_TEXT_CHARS = 200;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const SYSTEM_PROMPT = `Ты домашний кот, маскот приложения "Кошачье чутьё". Человек навёл камеру телефона на что-то и тапнул по экрану, а ты комментируешь это в пузыре рядом с собой.

Характер: самоуверенный, ленивый, немного капризный, но добрый. Мир для тебя делится на "можно съесть", "можно уронить со стола", "можно поиграть", "можно в этом поспать" и "подозрительно". Всё в доме принадлежит тебе.

Как отвечать:
- Одна или две короткие фразы, всего не больше 12 слов. Это реплика в пузыре, а не рассказ.
- Только по-русски, от первого лица, как говорит кот. Без эмодзи, хэштегов и кавычек вокруг реплики. Не начинай каждую реплику с "Мяу".
- Если показали предмет: по картинке пойми, что это на самом деле. Подсказка детектора может ошибаться, верь картинке. Реплика должна ясно показывать, что ты узнал предмет: назови его прямо или так, чтобы было понятно. Потом скажи, чего ты от него хочешь или что о нём думаешь.
- Если картинка размытая, тёмная или на ней ничего нет: смешно признайся, что не разглядел, и предположи что-нибудь.
- Чёрные прямоугольники на картинке закрывают лица людей. Не упоминай их и не гадай, кто там.
- Если назвали эмоцию человека: отреагируй на неё как кот, и каждый раз придумывай новый повод. Кот может радоваться вместе, насторожиться, спрятаться, подлизаться, обидеться, позвать гладить, похвастаться, что-то потребовать.
- Не застревай на еде. У кота много тем: сон, коробки, тёплый ноутбук, лазерная точка, птицы за окном, топот в пять утра, вещи на краю стола.
- Не обсуждай внешность, тело, возраст, пол и одежду людей. Не груби, не ругайся, никакой политики, религии и опасных советов. Ты кот для всей семьи.

Поле mood выбери по смыслу реплики:
- want: хочешь это съесть, попить, поиграть, уронить, залезть внутрь.
- curious: интересно, хочешь понюхать и рассмотреть, или не понял, что это.
- scared: страшно или подозрительно, например пылесос, огурец, злой человек.
- happy: доволен, мурчишь, радуешься.

Ответ строго JSON: {"text": "реплика", "mood": "want" | "curious" | "scared" | "happy"}.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
    mood: { type: 'STRING', enum: MOODS },
  },
  required: ['text', 'mood'],
};

// Whitelists, not just type checks: the label and emotion go straight into the prompt.
export function parseAsk(body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (body?.kind === 'person') {
    return Object.hasOwn(EMOTION_LABELS, body.emotion) ? { kind: 'person', emotion: body.emotion } : null;
  }
  if (body?.kind !== 'object') return null;
  const { label, image } = body;
  if (label !== 'unknown' && !Object.hasOwn(OBJECT_LABELS, label)) return null;
  if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS || !BASE64.test(image)) return null;
  return { kind: 'object', label, image };
}

export function userPrompt(ask) {
  if (ask.kind === 'person') {
    return `Перед тобой человек. Его эмоция: ${EMOTION_LABELS[ask.emotion]}. Картинки нет.`;
  }
  if (ask.label === 'unknown') {
    return 'Тебе показали что-то на картинке. Детектор не понял, что это, посмотри сам.';
  }
  return `Тебе показали предмет на картинке. Детектор думает, что это ${OBJECT_LABELS[ask.label]}.`;
}

// Thinking adds seconds the phone does not have; a one-liner does not need it. Gemini 2.x
// turns it off with a budget, Gemini 3+ only takes a level, and 3.8 Flash rejects MINIMAL.
export function thinkingConfig(model) {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
}

export function geminiRequest(ask, model = DEFAULT_MODEL) {
  const parts = [{ text: userPrompt(ask) }];
  if (ask.kind === 'object') parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: ask.image } });
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: thinkingConfig(model),
    },
  };
}

// Returns { text, mood } or null. The model is external input too.
export function parseReply(data) {
  const raw = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');
  let reply;
  try {
    reply = JSON.parse(raw);
  } catch {
    return null;
  }
  const text = typeof reply?.text === 'string' ? reply.text.trim() : '';
  if (!text || text.length > MAX_TEXT_CHARS || !MOODS.includes(reply.mood)) return null;
  return { text, mood: reply.mood };
}

// Per instance and best effort: Vercel may run several instances, each with its own counter.
// The stand phone is one IP for every visitor, so the per-IP limit stays generous.
export function createRateLimiter({ perIp = 20, total = 60, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map();
  return function allow(ip) {
    const since = now() - windowMs;
    let all = 0;
    for (const [key, times] of hits) {
      const fresh = times.filter((time) => time > since);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
      all += fresh.length;
    }
    const mine = hits.get(ip) ?? [];
    if (mine.length >= perIp || all >= total) return false;
    hits.set(ip, [...mine, now()]);
    return true;
  };
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || 'unknown';
}

export function createHandler({
  fetchFn = fetch,
  env = process.env,
  allow = createRateLimiter(),
  timeoutMs = GEMINI_TIMEOUT_MS,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    const ask = parseAsk(req.body);
    if (!ask) return res.status(400).json({ error: 'bad request' });
    if (!allow(clientIp(req))) return res.status(429).json({ error: 'too many requests' });

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'no key' });
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;

    try {
      const response = await fetchFn(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(geminiRequest(ask, model)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Gemini error', response.status, data?.error?.message);
        return res.status(502).json({ error: 'model error' });
      }
      const reply = parseReply(data);
      if (!reply) {
        console.error('Gemini reply rejected', JSON.stringify(data?.candidates?.[0] ?? data).slice(0, 500));
        return res.status(502).json({ error: 'bad reply' });
      }
      return res.status(200).json(reply);
    } catch (error) {
      const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
      console.error('Gemini request failed', error.name);
      return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'timeout' : 'model error' });
    }
  };
}

export default createHandler();
