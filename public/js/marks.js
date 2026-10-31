const FALLBACK_MARK = '🕷️';
const SPIDER_SRC = '/assets/halloween/spider-angry.webp';
const MAX_PIXEL_RATIO = 2;
const SPIDER_WIDTH_SHARE = 1.5;

const spider = new Image();
spider.src = SPIDER_SRC;

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
  for (const mark of marks) hangSpider(context, mark);
  if (marks.length > 0) canvas.dataset.marked = 'yes';
  else delete canvas.dataset.marked;
}
