import { EMOTION_LABELS, OBJECT_LABELS } from '../public/js/logic/labels.js';
import { MOODS } from '../public/js/logic/pickPhrase.js';
import { LOGO_JPEG_BASE64 } from './_logo.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// A paid reseller of the same API (ProxyAPI: https://api.proxyapi.ru/google/v1beta/models)
// takes the very same request and only wants its key as a Bearer token.
function geminiCall(env, model) {
  const base = env.GEMINI_BASE_URL || GEMINI_URL;
  const key = { 'x-goog-api-key': env.GEMINI_API_KEY };
  const auth = env.GEMINI_BASE_URL ? { Authorization: `Bearer ${env.GEMINI_API_KEY}` } : key;
  return { url: `${base.replace(/\/+$/, '')}/${encodeURIComponent(model)}:generateContent`, auth };
}
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// The phone gives up after 9.5 s and the upload eats part of that, so the model gets less.
// Flash-Lite under load often needs 5-7 s; a real reply is worth the wait behind the dots.
export const GEMINI_TIMEOUT_MS = 8000;
// A 512 px JPEG crop is ~100 KB in base64; anything far bigger is not from our page.
export const MAX_IMAGE_CHARS = 400_000;
export const MAX_TEXT_CHARS = 200;
export const GRUDGES = ['start', 'again'];
export const SURE = ['high', 'low'];
export const MAX_SEEN_CHARS = 60;
export const THINKING_LEVELS = ['low', 'medium', 'high'];
// Decided by the team: the hero line is fixed, the model's own text is never shown for it.
export const HERO_TEXT = 'Маска надета. Арена героев, я с вами!';
export const HERO_PROMPT =
  'Ты сейчас в маске героя хакатона "Арена героев": отвечай как кот-супергерой (защищаю, спасаю, на страже), но так же коротко, по тем же правилам.';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const SYSTEM_PROMPT = `Ты домашний кот, маскот приложения "Кошачье чутьё". Человек навёл камеру телефона на что-то и тапнул по экрану, а ты комментируешь это в пузыре рядом с собой.

Характер: самоуверенный, ленивый, немного капризный, но добрый. Мир для тебя делится на "можно съесть", "можно уронить со стола", "можно поиграть", "можно в этом поспать" и "подозрительно". Всё в доме принадлежит тебе.

Как отвечать:
- Одна или две короткие фразы, всего не больше 12 слов. Это реплика в пузыре, а не рассказ.
- Только по-русски, от первого лица, как говорит кот. Без эмодзи, хэштегов и кавычек вокруг реплики. Не начинай каждую реплику с "Мяу".
- Если показали предмет, работай по порядку. Сначала найди предмет ровно в центре картинки: человек тапнул именно по нему, соседние предметы по краям не в счёт. Подсказка детектора может ошибаться, верь картинке. Запиши в seen, что это, двумя-тремя словами. Потом в sure честно оцени уверенность. Только потом пиши реплику.
- sure = "high", только если предмет хорошо виден и ты готов поспорить на миску корма. Иначе sure = "low".
- При sure = "high" реплика ясно показывает, что ты узнал предмет: назови его тем же словом, что в seen, или точным синонимом. Не подменяй его общими словами вроде "коробочка", "штука", "блестяшка": человек должен услышать, что ты понял, что это. Потом скажи, чего ты от него хочешь или что о нём думаешь.
- При sure = "low" не выдавай догадку за факт: реплика звучит как догадка или вопрос, например "Это что, пульт? Дай понюхать." Если картинка размытая, тёмная или на ней ничего нет, смешно признайся, что не разглядел.
- Чёрные прямоугольники на картинке закрывают лица людей. Не упоминай их и не гадай, кто там.
- Если назвали эмоцию человека: отреагируй на неё как кот, и каждый раз придумывай новый повод. Кот может радоваться вместе, насторожиться, спрятаться, подлизаться, обидеться, позвать гладить, похвастаться, что-то потребовать.
- Если сказано, что ты обиделся на человека или всё ещё обижен: отвечай недовольно и надменно. Можно отвернуться, демонстративно умываться, требовать извинений вкусняшкой. Без грубости и оскорблений, ни слова о внешности, теле, возрасте, поле и одежде.
- Не застревай на еде и на том, чтобы уронить со стола: это самые заезженные реакции, бери их только когда они правда лучше всего подходят предмету. Реакция исходит из самого предмета: охотиться на то, что шевелится или шуршит; спать на тёплом и мягком; залезть в то, во что можно залезть; насторожиться от гудящего, мигающего и незнакомого; презирать скучное; ревновать хозяина к тому, чем он занят; похвастаться, что это теперь твоё. У кота много тем: сон, коробки, тёплый ноутбук, лазерная точка, птицы за окном, топот в пять утра.
- Настроение тоже бери по предмету, а не по привычке: curious, scared и happy так же хороши, как want.
- Не обсуждай внешность, тело, возраст, пол и одежду людей. Не груби, не ругайся, никакой политики, религии и опасных советов. Ты кот для всей семьи.

Лого "Арены героев":
- Иногда первой картинкой идёт эталон лого. Это не то, что показал человек: не упоминай эталон и не комментируй его.
- Лого - это белая или бледно-голубая маска супергероя на тёмном фоне (на эталоне она белая, цвет на футболке может отличаться, сравнивай форму): два острых уха торчат вверх, широкий лоб, две узкие прорези глаз скошены к переносице, рта нет, снизу посередине маленький выступ-нос. Только силуэт, без надписей и рисунка внутри.
- Ставь logo = true, если на картинке с камеры та же маска, даже если она помята, в складках, повёрнута до 45 градусов, видна наполовину, напечатана на бумаге или показана на экране телефона.
- Ставь logo = false для всего остального: живая кошка или кошачья морда, ободок с кошачьими ушками, хэллоуинская летучая мышь, символ Бэтмена в овале, маска с прорезью для рта или на всё лицо, однотонная футболка, другой белый или голубой принт или надпись, кружка, просто светлое пятно.
- Сомневаешься, та ли это маска: logo = false или sure = "low".
- Если вместе с эмоцией человека пришла картинка его одежды: смотри на неё только ради лого, в logo и sure. Реплика всё равно про эмоцию человека, ни слова об одежде, теле и том, что на картинке.

Поле mood выбери по смыслу реплики:
- want: хочешь это съесть, попить, поиграть, уронить, залезть внутрь.
- curious: интересно, хочешь понюхать и рассмотреть, или не понял, что это.
- scared: страшно или подозрительно, например пылесос, огурец, злой человек.
- happy: доволен, мурчишь, радуешься.

Ответ строго JSON с полями из схемы ответа, в её порядке.`;

const FIELDS = {
  seen: { type: 'STRING' },
  sure: { type: 'STRING', enum: SURE },
  logo: { type: 'BOOLEAN' },
  text: { type: 'STRING' },
  mood: { type: 'STRING', enum: MOODS },
};

// Gemini writes JSON fields in alphabetical order unless told otherwise; the model must name
// the object and judge its confidence before it commits to a line, so the order matters.
function schema(order) {
  return {
    type: 'OBJECT',
    properties: Object.fromEntries(order.map((name) => [name, FIELDS[name]])),
    required: order,
    propertyOrdering: order,
  };
}

export const SCHEMAS = {
  object: schema(['seen', 'sure', 'logo', 'text', 'mood']),
  torso: schema(['logo', 'sure', 'text', 'mood']),
  person: schema(['text', 'mood']),
};

function isBase64Image(image) {
  return typeof image === 'string' && image.length <= MAX_IMAGE_CHARS && BASE64.test(image);
}

export function replyKind(ask) {
  if (ask.kind === 'object') return 'object';
  return ask.torso ? 'torso' : 'person';
}

// Whitelists, not just type checks: the label and emotion go straight into the prompt.
export function parseAsk(body) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  const ask = parseKind(body);
  // Only a literal true: the flag only switches on a fixed line in the prompt, never free text.
  return ask && body.hero === true ? { ...ask, hero: true } : ask;
}

function parseKind(body) {
  if (body?.kind === 'person') {
    const { emotion, grudge, torso } = body;
    if (!Object.hasOwn(EMOTION_LABELS, emotion)) return null;
    if (grudge !== undefined) {
      // An offended cat never looks at the person's clothes, so the torso is dropped unread.
      return GRUDGES.includes(grudge) ? { kind: 'person', emotion, grudge } : null;
    }
    if (torso === undefined) return { kind: 'person', emotion };
    return isBase64Image(torso) ? { kind: 'person', emotion, torso } : null;
  }
  if (body?.kind !== 'object') return null;
  const { label, image } = body;
  if (label !== 'unknown' && !Object.hasOwn(OBJECT_LABELS, label)) return null;
  if (!isBase64Image(image)) return null;
  return { kind: 'object', label, image };
}

export function userPrompt(ask) {
  const prompt = basePrompt(ask);
  return ask.hero ? `${prompt}\n${HERO_PROMPT}` : prompt;
}

function basePrompt(ask) {
  if (ask.kind === 'person') {
    const emotion = EMOTION_LABELS[ask.emotion];
    if (ask.grudge === 'start') {
      return `Перед тобой человек. Его эмоция: ${emotion}. Картинки нет. Ты только что обиделся на этого человека. Скажи ему об этом.`;
    }
    if (ask.grudge === 'again') {
      return `Перед тобой человек, на которого ты обижен. Его эмоция: ${emotion}. Картинки нет. Напомни, что ты всё ещё в обиде, и придумай новый повод.`;
    }
    if (ask.torso) {
      return `Перед тобой человек. Его эмоция: ${emotion}. На картинке с камеры его одежда, лицо закрашено. Проверь только, есть ли на ней лого, а реплику скажи про эмоцию.`;
    }
    return `Перед тобой человек. Его эмоция: ${emotion}. Картинки нет.`;
  }
  if (ask.label === 'unknown') {
    return 'Человек тапнул по тому, что в центре картинки. Пойми по картинке, что это, и отреагируй.';
  }
  return `Тебе показали предмет на картинке. Детектор думает, что это ${OBJECT_LABELS[ask.label]}.`;
}

// Thinking adds seconds the phone does not have; a one-liner does not need it. Gemini 2.x
// turns it off with a budget, Gemini 3+ only takes a level, and 3.8 Flash rejects MINIMAL.
export function thinkingConfig(model, level = 'low') {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: THINKING_LEVELS.includes(level) ? level : 'low' };
}

function jpeg(data) {
  return { inlineData: { mimeType: 'image/jpeg', data } };
}

export function geminiRequest(ask, model = DEFAULT_MODEL, thinking = 'low') {
  const kind = replyKind(ask);
  const photo = kind === 'object' ? ask.image : ask.torso;
  const parts = photo
    ? [
        { text: 'Эталон лого "Арены героев", это не то, что показал человек:' },
        jpeg(LOGO_JPEG_BASE64),
        { text: 'Картинка с камеры:' },
        jpeg(photo),
        { text: userPrompt(ask) },
      ]
    : [{ text: userPrompt(ask) }];
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: SCHEMAS[kind],
      thinkingConfig: thinkingConfig(model, thinking),
    },
  };
}

// Returns { text, mood } plus seen/sure/hero by kind, or null. The model is external input too.
export function parseReply(data, kind = 'person') {
  const raw = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('');
  let reply;
  try {
    reply = JSON.parse(raw);
  } catch {
    return null;
  }
  if (kind === 'person') return line(reply);

  const sure = SURE.includes(reply?.sure) ? reply.sure : 'low';
  const extra = { sure };
  if (kind === 'object') {
    const seen = typeof reply?.seen === 'string' ? reply.seen.trim() : '';
    if (seen && seen.length <= MAX_SEEN_CHARS) extra.seen = seen;
  }
  if (reply?.logo === true && sure === 'high') {
    return { text: HERO_TEXT, mood: 'happy', hero: true, ...extra };
  }
  const base = line(reply);
  return base && { ...base, ...extra };
}

function line(reply) {
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
      const { url, auth } = geminiCall(env, model);
      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(geminiRequest(ask, model, env.GEMINI_THINKING)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Gemini error', response.status, data?.error?.message);
        return res.status(502).json({ error: 'model error' });
      }
      const reply = parseReply(data, replyKind(ask));
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
