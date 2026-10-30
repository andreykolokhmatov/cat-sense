import { CAT_MATRIX, applyMatrix } from './logic/catVision.js';
import { videoFrame, visibleSource } from './logic/coverMap.js';
import { wrapText } from './logic/wrapText.js';

const WIDTH = 1080;
const STRIP_HEIGHT = 200;
const ORANGE = '#FA9A3C';
const INK = '#1c1c1e';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TITLE = 'Кошачье чутьё';
// Drawing at a fraction of the size and stretching back stands in for the blur: ctx.filter
// does not exist in Safari.
const SOFTEN_SCALE = 0.4;
const CAT_HEIGHT = 340;
const BUBBLE = { font: `600 44px ${FONT}`, lineHeight: 58, pad: 30, radius: 40, maxWidth: 680, maxLines: 6, tail: 18 };
const JPEG_QUALITY = 0.9;
const REVOKE_MS = 10_000;

function drawCamera(ctx, video, view, catMode, height) {
  const { sx, sy, sw, sh } = visibleSource(view, videoFrame(video));
  if (!catMode) {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, WIDTH, height);
    return;
  }
  const small = document.createElement('canvas');
  small.width = Math.round(WIDTH * SOFTEN_SCALE);
  small.height = Math.round(height * SOFTEN_SCALE);
  small.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, WIDTH, height);
  const pixels = ctx.getImageData(0, 0, WIDTH, height);
  applyMatrix(pixels.data, CAT_MATRIX);
  ctx.putImageData(pixels, 0, 0);
}

function drawStrip(ctx, top) {
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, top, WIDTH, STRIP_HEIGHT);
  ctx.fillStyle = INK;
  ctx.font = `800 64px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(TITLE, 56, top + STRIP_HEIGHT / 2);
}

// Returns the cat's top edge, so the bubble can sit right above it.
function drawCat(ctx, img, bottom) {
  if (!img?.complete || !img.naturalWidth) return bottom - STRIP_HEIGHT;
  const width = (CAT_HEIGHT * img.naturalWidth) / img.naturalHeight;
  const top = bottom - CAT_HEIGHT - 16;
  ctx.drawImage(img, WIDTH - width - 40, top, width, CAT_HEIGHT);
  return top;
}

function drawBubble(ctx, text, bottom) {
  const { font, lineHeight, pad, radius, maxWidth, maxLines, tail } = BUBBLE;
  ctx.font = font;
  const lines = wrapText(text, maxWidth - pad * 2, (line) => ctx.measureText(line).width, maxLines);
  if (!lines.length) return;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + pad * 2;
  const height = lines.length * lineHeight + pad * 2;
  const right = WIDTH - 40;
  const left = right - width;
  const top = bottom - tail - height;
  const tailX = right - 110;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(255, 255, 255, .95)';
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, radius);
  ctx.moveTo(tailX - tail, top + height);
  ctx.lineTo(tailX, top + height + tail);
  ctx.lineTo(tailX + tail, top + height);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, left + pad, top + pad + lineHeight * (i + 0.5)));
}

// view is the on-screen size of the camera area, { width, height }.
export function composeFrame({ video, view, catMode, catImg, text }) {
  const cameraHeight = Math.round((WIDTH * view.height) / view.width);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = cameraHeight + STRIP_HEIGHT;
  const ctx = canvas.getContext('2d');
  drawCamera(ctx, video, view, catMode, cameraHeight);
  drawStrip(ctx, cameraHeight);
  const catTop = drawCat(ctx, catImg, canvas.height);
  if (text) drawBubble(ctx, text, catTop);
  return canvas;
}

function fileName() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `cat-sense-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}

// Everything up to navigator.share stays synchronous: after an await Safari no longer treats
// the call as part of the tap and refuses to open the share sheet. That is why the JPEG comes
// from toDataURL and not from the callback-based toBlob.
export function saveFrame(options) {
  const dataUrl = composeFrame(options).toDataURL('image/jpeg', JPEG_QUALITY);
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0));
  const file = new File([bytes], fileName(), { type: 'image/jpeg' });

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((error) => {
      if (error.name !== 'AbortError') download(file);
    });
    return;
  }
  download(file);
}
