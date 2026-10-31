import { EMOTION_LABELS } from './labels.js';
import { QUALITY_NAMES } from './perf.js';

// What the developer log says about one tap: what went to Gemini and how it ended.
// No DOM here, so the wording and the outcome rules are covered by tests.

const GRUDGE_LABELS = { start: 'обиделся', again: 'всё ещё обижен' };
const SERVER_ERRORS = {
  'bad request': 'сервер отверг запрос',
  'too many requests': 'лимит запросов',
  'no key': 'на сервере нет ключа Gemini',
  'model error': 'ошибка модели',
  'bad reply': 'модель ответила не по формату',
  timeout: 'модель не успела',
};

function whatIsTapped(target) {
  if (target.kind === 'person') {
    const parts = [`человек, эмоция: ${EMOTION_LABELS[target.emotion] ?? target.emotion}`];
    if (target.grudge) parts.push(`кот ${GRUDGE_LABELS[target.grudge] ?? target.grudge}`);
    return parts.join(', ');
  }
  return target.label === 'unknown' ? 'предмет, название определит Gemini' : `предмет: ${target.label}`;
}

// `hero`: the request went out with the cat in the mask.
export function describeTarget(target, hero = false) {
  return hero ? `${whatIsTapped(target)}, кот в маске` : whatIsTapped(target);
}

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// `call` is what the tracked fetch saw: sent, status, error (an exception name) and raw body.
// `reply` is what askCat gave the cat. Returns { ok, reason } for a fallback, { ok, mood } for
// a real answer from the model.
export function askOutcome(call, reply) {
  if (!call.sent) return { ok: false, reason: 'запрос не отправлен: нет кадра без лиц (модель лиц не загрузилась)' };
  if (call.error === 'AbortError' || (call.status === undefined && !call.error)) {
    return { ok: false, reason: 'таймаут: ответ не пришёл вовремя' };
  }
  if (call.error) return { ok: false, reason: `нет связи с сервером (${call.error})` };
  const body = parse(call.raw);
  if (call.status !== 200) {
    const why = SERVER_ERRORS[body?.error] ?? body?.error;
    return { ok: false, reason: `HTTP ${call.status}${why ? `: ${why}` : ''}` };
  }
  if (!body || body.text !== reply.text) return { ok: false, reason: 'ответ модели не прошёл проверку' };
  const outcome = { ok: true, mood: body.mood };
  if (typeof body.seen === 'string') outcome.seen = body.seen;
  if (typeof body.sure === 'string') outcome.sure = body.sure;
  if (body.hero === true) outcome.hero = true;
  return outcome;
}

// What Gemini recognised, for tuning by eye: `seen` is never shown to the visitor.
export function recognitionLine({ seen, sure, hero } = {}) {
  const parts = [];
  if (seen) parts.push(`видит: ${seen}`);
  if (sure) parts.push(`уверенность: ${sure}`);
  if (hero) parts.push('ЛОГО, маска');
  return parts.join(' · ');
}

const percent = (share) => `${Math.round(share * 100)}%`;

// The logo gate on a tap on clothes: its figures go in the log so the thresholds can be tuned
// on the real shirt. `sent` is whether the crop actually went to Gemini.
export function gateLine(gate, sent) {
  if (!gate) return 'одежда: кадр не прочитан, торс не отправлен';
  const figures = `белого ${percent(gate.white)}, тёмного ${percent(gate.dark)}`;
  if (sent) return `одежда: ${figures}, гейт пропустил, торс → Gemini`;
  return `одежда: ${figures}, ${gate.pass ? 'гейт пропустил, но нет модели лиц' : 'гейт не пропустил'}, торс не отправлен`;
}

export function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)} с`;
}

// Where the time of one tap went: cutting the crop on the phone, the round trip to the model,
// and the whole way from the finger to the text in the bubble. A missing figure is skipped.
export function phasesLine({ snapMs, askMs, totalMs } = {}) {
  const parts = [];
  if (typeof snapMs === 'number') parts.push(`вырезка ${formatSeconds(snapMs)}`);
  if (typeof askMs === 'number') parts.push(`запрос ${formatSeconds(askMs)}`);
  if (typeof totalMs === 'number') parts.push(`от тапа до текста ${formatSeconds(totalMs)}`);
  return parts.join(' · ');
}

const dash = (value, format) => (typeof value === 'number' ? format(value) : '—');

// One line of speed figures for the status bar: how smooth the cat view runs, at which quality
// level, and what a detection tick costs on this phone.
export function perfLine({ cat, tickMs, cocoMs, cocoEvery } = {}) {
  const view = cat ? `${dash(cat.fps, (fps) => `${Math.round(fps)} к/с`)} (${QUALITY_NAMES[cat.level] ?? cat.level})` : 'выкл';
  const coco = dash(cocoMs, (ms) => `${Math.round(ms)} мс${cocoEvery > 1 ? ` каждый ${cocoEvery}-й` : ''}`);
  return `зрение ${view} · тик ${dash(tickMs, (ms) => `${Math.round(ms)} мс`)} · COCO ${coco}`;
}

// The label of a face while the cat holds a grudge: how close its colours (1 is the same) and
// its proportions (0 is the same) are to the closest offender. These numbers tune grudges.js.
export function likenessLine(likeness) {
  if (!likeness) return '';
  const geometry = likeness.geometry == null ? '' : ` · лицо ${likeness.geometry.toFixed(2)}`;
  return ` · цвет ${likeness.color.toFixed(2)}${geometry}`;
}
