const ELLIPSIS = '…';

// Splits by code points, not UTF-16 units, so emoji and surrogate pairs stay whole.
function splitLongWord(word, maxWidth, measure) {
  const pieces = [];
  let piece = '';
  for (const char of Array.from(word)) {
    if (piece && measure(piece + char) > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece += char;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function withEllipsis(line, maxWidth, measure) {
  const chars = Array.from(line);
  while (chars.length && measure(chars.join('') + ELLIPSIS) > maxWidth) chars.pop();
  return chars.join('').trimEnd() + ELLIPSIS;
}

// measure(text) returns the drawn width, e.g. text => ctx.measureText(text).width.
export function wrapText(text, maxWidth, measure, maxLines = Infinity) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    const pieces = measure(word) <= maxWidth ? [word] : splitLongWord(word, maxWidth, measure);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1);
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = withEllipsis(kept[maxLines - 1], maxWidth, measure);
  return kept;
}
