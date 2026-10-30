import { videoFrame, videoToScreen } from './logic/coverMap.js';
import { captionOf } from './logic/labels.js';

const MAX_PIXEL_RATIO = 2;
const BOX_COLOR = '#f5a623';
const LABEL_BACKGROUND = 'rgba(0, 0, 0, .65)';
const LABEL_COLOR = '#eee';
const LABEL_HEIGHT = 22;
const LABEL_PADDING = 6;

function fitCanvas(canvas, rect) {
  const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return ratio;
}

function drawLabel(context, text, [x, y]) {
  // A box cut by the cover crop starts off screen, and its label must stay readable.
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const { width } = context.measureText(text);
  context.fillStyle = LABEL_BACKGROUND;
  context.fillRect(left, top, width + 2 * LABEL_PADDING, LABEL_HEIGHT);
  context.fillStyle = LABEL_COLOR;
  context.fillText(text, left + LABEL_PADDING, top + LABEL_HEIGHT / 2);
}

function drawDetections(canvas, video, detections) {
  const rect = canvas.getBoundingClientRect();
  const ratio = fitCanvas(canvas, rect);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.font = '14px system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.strokeStyle = BOX_COLOR;
  context.lineWidth = 2;

  const frame = videoFrame(video);
  for (const detection of detections) {
    const box = videoToScreen(detection.bbox, rect, frame);
    if (!box) return;
    context.strokeRect(...box);
    drawLabel(context, captionOf(detection), box);
  }
}

// Returns the redraw function for the detection tick.
export function startOverlay(canvas, video, getDetections) {
  const redraw = () => drawDetections(canvas, video, getDetections());
  window.addEventListener('resize', redraw);
  window.addEventListener('orientationchange', redraw);
  return redraw;
}
