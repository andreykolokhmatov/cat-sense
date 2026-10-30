const DEFAULT_OPTIONS = { padding: 0.15, minSide: 160, maxSide: 512 };

// Returns drawImage arguments: source rectangle (sx, sy, sw, sh) and output size (dw, dh).
export function cropRegion([x, y, width, height], frame, options = {}) {
  const { padding, minSide, maxSide } = { ...DEFAULT_OPTIONS, ...options };

  const paddedWidth = Math.max(width * (1 + 2 * padding), minSide);
  const paddedHeight = Math.max(height * (1 + 2 * padding), minSide);
  const left = Math.max(0, x + width / 2 - paddedWidth / 2);
  const top = Math.max(0, y + height / 2 - paddedHeight / 2);
  const right = Math.min(frame.width, x + width / 2 + paddedWidth / 2);
  const bottom = Math.min(frame.height, y + height / 2 + paddedHeight / 2);
  if (right <= left || bottom <= top) return null;

  const sx = Math.round(left);
  const sy = Math.round(top);
  const sw = Math.round(right) - sx;
  const sh = Math.round(bottom) - sy;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  return {
    sx,
    sy,
    sw,
    sh,
    dw: Math.max(1, Math.round(sw * scale)),
    dh: Math.max(1, Math.round(sh * scale)),
  };
}

// Every object is framed by the tap alone, so the box is wide enough to hold a whole book
// or a mug at arm's length in a 1280x720 frame.
export function tapBox(tap, side = 320) {
  return [tap.x - side / 2, tap.y - side / 2, side, side];
}
