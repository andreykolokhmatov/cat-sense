const FALLBACK_MARK = '😾';
const CAT_SRC = '/assets/cat/angry.webp';
const MAX_PIXEL_RATIO = 2;
const CAT_WIDTH_SHARE = 1.4;
// The drawn cat inside the square picture, as shares of its side: the empty margins are cut so
// the cat sits right on the head instead of floating above it.
const CAT_BOX = { x: 0.14, y: 0.2, width: 0.75, height: 0.69 };

const cat = new Image();
cat.src = CAT_SRC;

// The offended cat perches on the offender's head: the same angry cat as in the panel, so the
// mark reads as "this one is the cat's enemy" without a legend.
function perchCat(context, { x, y, size }) {
  const ready = cat.complete && cat.naturalWidth > 0;
  if (!ready) {
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.fillText(FALLBACK_MARK, x, y);
    context.restore();
    return;
  }
  const sx = CAT_BOX.x * cat.naturalWidth;
  const sy = CAT_BOX.y * cat.naturalHeight;
  const sw = CAT_BOX.width * cat.naturalWidth;
  const sh = CAT_BOX.height * cat.naturalHeight;
  const width = size * CAT_WIDTH_SHARE;
  const height = (width * sh) / sw;
  const top = Math.max(0, y + size / 2 - height);
  context.save();
  // A shadow keeps the outline readable on a busy camera picture.
  context.shadowColor = 'rgba(0, 0, 0, .4)';
  context.shadowBlur = 8;
  context.shadowOffsetY = 2;
  context.drawImage(cat, sx, sy, sw, sh, x - width / 2, top, width, height);
  context.restore();
}

// The canvas bitmap follows the CSS box; the box itself belongs to the stylesheet, because
// taps are mapped through the video rect and the overlay must stay exactly on top of it.
export function drawMarks(canvas, marks) {
  // Until the first grudge the overlay stays an untouched empty canvas, as it was before marks.
  if (marks.length === 0 && !canvas.dataset.marked) return;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  for (const mark of marks) perchCat(context, mark);
  if (marks.length > 0) canvas.dataset.marked = 'yes';
  else delete canvas.dataset.marked;
}
