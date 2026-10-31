import { GRUDGES, MOODS, pickPhrase } from './pickPhrase.js';

export const ASK_TIMEOUT_MS = 9500;

// null means there is nothing safe to send. A person never carries `image`, even if one was
// passed: only the emotion name, the grudge and a gated clothes crop (`torso`, faces painted
// over) may leave the phone, never the box or the track id. `hero` marks a cat in the mask.
export function askBody(target, image, { torso = null, hero = false } = {}) {
  let body;
  if (target.kind === 'person') {
    body = { kind: 'person', emotion: target.emotion };
    if (GRUDGES.includes(target.grudge)) body.grudge = target.grudge;
    // Any grudge at all, even one not on the list: an offended cat never looks at clothes.
    else if (target.grudge == null && typeof torso === 'string' && torso) body.torso = torso;
  } else {
    if (!image) return null;
    body = { kind: 'object', label: target.label, image };
  }
  if (hero === true) body.hero = true;
  return body;
}

function isValidReply(reply) {
  return typeof reply?.text === 'string' && reply.text.trim() !== '' && MOODS.includes(reply.mood);
}

function cleanReply(reply) {
  const clean = { text: reply.text, mood: reply.mood };
  if (reply.hero === true) clean.hero = true;
  return clean;
}

async function requestReply(body, fetchFn, signal) {
  const response = await fetchFn('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) return null;
  const reply = await response.json();
  return isValidReply(reply) ? cleanReply(reply) : null;
}

// Resolves to { text, mood, hero? } and never rejects: any failure falls back to a local
// phrase, which never puts the mask on.
export async function askCat({
  target,
  image,
  torso = null,
  hero = false,
  phrases,
  lastText = null,
  fetchFn = fetch,
  timeoutMs = ASK_TIMEOUT_MS,
  random = Math.random,
}) {
  const fallback = () => pickPhrase(phrases, target, lastText, random);
  const body = askBody(target, image, { torso, hero });
  if (!body) return fallback();

  const controller = new AbortController();
  let timer;
  // Racing a timer rather than relying on abort alone: the deadline must also cover
  // res.json(), and a fetch that ignores the signal must not hang the cat.
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    const reply = await Promise.race([requestReply(body, fetchFn, controller.signal), deadline]);
    return reply ?? fallback();
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
