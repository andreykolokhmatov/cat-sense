import { MOODS, pickPhrase } from './pickPhrase.js';

export const ASK_TIMEOUT_MS = 6000;

// null means there is nothing safe to send. A person never carries an image, even if one
// was passed: only the emotion name may leave the phone.
export function askBody(target, image) {
  if (target.kind === 'person') return { kind: 'person', emotion: target.emotion };
  if (!image) return null;
  return { kind: 'object', label: target.label, image };
}

function isValidReply(reply) {
  return typeof reply?.text === 'string' && reply.text.trim() !== '' && MOODS.includes(reply.mood);
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
  return isValidReply(reply) ? { text: reply.text, mood: reply.mood } : null;
}

// Resolves to { text, mood } and never rejects: any failure falls back to a local phrase.
export async function askCat({
  target,
  image,
  phrases,
  lastText = null,
  fetchFn = fetch,
  timeoutMs = ASK_TIMEOUT_MS,
  random = Math.random,
}) {
  const fallback = () => pickPhrase(phrases, target, lastText, random);
  const body = askBody(target, image);
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
