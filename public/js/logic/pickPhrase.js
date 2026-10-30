export const MOODS = ['want', 'curious', 'scared', 'happy'];
// Mirrors GRUDGES in api/ask.js: the client and the API are separate zones.
export const GRUDGES = ['start', 'again'];

function findEntry(phrases, target) {
  if (target.kind === 'person') {
    const grudge = GRUDGES.includes(target.grudge) ? phrases.grudge?.[target.grudge] : null;
    return grudge ?? phrases.emotions[target.emotion];
  }
  return phrases.objects[target.label];
}

export function pickPhrase(phrases, target, lastText = null, random = Math.random) {
  const entry = findEntry(phrases, target) ?? phrases.fallback;
  const fresh = entry.lines.filter((line) => line !== lastText);
  const lines = fresh.length > 0 ? fresh : entry.lines;
  return { text: lines[Math.floor(random() * lines.length)], mood: entry.mood };
}
