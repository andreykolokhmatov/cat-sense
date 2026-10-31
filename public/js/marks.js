const FALLBACK_MARK = '🕷️';
const SPIDER_SRC = '/assets/halloween/spider-angry.webp';
const MAX_PIXEL_RATIO = 2;
const TINT = 'rgba(235, 30, 40, .38)';
// Only without a contour: the box is tight, so the oval reaches past it over the head.
const TINT_SPREAD = { x: 0.78, y: 0.95 };
const OUTLINE_GROWTH = 1.06;
const SPIDER_WIDTH_SHARE = 1.5;

const spider = new Image();
spider.src = SPIDER_SRC;

// The face contour from the mesh is tight; a little growth around its centre covers the edge
// of the face instead of stopping at it.
function growOutline(points) {
  const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * OUTLINE_GROWTH, cy + (y - cy) * OUTLINE_GROWTH]);
}

// A closed curve through the midpoints of the contour: the 36 mesh points would show corners.
function traceOutline(context, outline) {
  const points = growOutline(outline);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(points[points.length - 1], points[0]);
  context.moveTo(start[0], start[1]);
  points.forEach((point, index) => {
    const end = mid(point, points[(index + 1) % points.length]);
    context.quadraticCurveTo(point[0], point[1], end[0], end[1]);
  });
  context.closePath();
}

function tint(context, { face: { x, y, width, height }, outline }) {
  context.save();
  context.fillStyle = TINT;
  context.shadowColor = 'rgba(255, 40, 50, .7)';
  context.shadowBlur = Math.max(10, width * 0.25);
  context.beginPath();
  // No contour (an incomplete mesh): the box still gets painted, as an oval.
  if (outline) traceOutline(context, outline);
  else context.ellipse(x + width / 2, y + height / 2, width * TINT_SPREAD.x, height * TINT_SPREAD.y, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

// The spider hangs on a thread from the top of the screen and stops just above the head.
function hangSpider(context, { x, y, size }) {
  const width = size * SPIDER_WIDTH_SHARE;
  const ready = spider.complete && spider.naturalWidth > 0;
  const height = ready ? (width * spider.naturalHeight) / spider.naturalWidth : size;
  const top = Math.max(0, y - height / 2);
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, .7)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, top + height * 0.2);
  context.stroke();
  if (ready) {
    context.drawImage(spider, x - width / 2, top, width, height);
  } else {
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${Math.round(size)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.fillText(FALLBACK_MARK, x, y);
  }
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
  for (const mark of marks) {
    if (mark.face) tint(context, mark);
    hangSpider(context, mark);
  }
  if (marks.length > 0) canvas.dataset.marked = 'yes';
  else delete canvas.dataset.marked;
}
