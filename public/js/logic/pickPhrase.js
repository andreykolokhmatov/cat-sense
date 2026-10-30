export const MOODS = ['want', 'curious', 'scared', 'happy'];

function findEntry(phrases, target) {
  if (target.kind === 'person') return phrases.emotions[target.emotion];
  return phrases.objects[target.label];
}

export function pickPhrase(phrases, target, lastText = null, random = Math.random) {
  const entry = findEntry(phrases, target) ?? phrases.fallback;
  const fresh = entry.lines.filter((line) => line !== lastText);
  const lines = fresh.length > 0 ? fresh : entry.lines;
  return { text: lines[Math.floor(random() * lines.length)], mood: entry.mood };
}
