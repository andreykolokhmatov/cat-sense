const MARK = '😾';
const MAX_PIXEL_RATIO = 2;

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
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const { x, y, size } of marks) {
    context.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.fillText(MARK, x, y);
  }
  if (marks.length > 0) canvas.dataset.marked = 'yes';
  else delete canvas.dataset.marked;
}
