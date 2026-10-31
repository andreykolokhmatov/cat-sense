import { videoToScreen } from './logic/coverMap.js';
import { askOutcome, describeTarget, formatSeconds, gateLine, perfLine, phasesLine, recognitionLine } from './logic/devLog.js';
import { EMOTION_LABELS } from './logic/labels.js';

// Developer mode, switched by a tap on the team name: boxes of what the phone found, the crop
// that went to Gemini and a log of every question and answer, to tune recognition on a phone.
// Nothing here leaves the phone; the log lives only in the page.

const STORAGE_KEY = 'cat-sense-dev';
const MAX_PIXEL_RATIO = 2;
const MAX_ENTRIES = 30;
// The crop box stays on the camera long enough to compare it with the answer.
const CROP_SHOW_MS = 5000;
// The tracked fetch reads the body on its own; askCat may finish a moment before that.
const RAW_WAIT_MS = 300;
const COLORS = { face: '#4ade80', body: '#fb923c', crop: '#facc15' };

let on = false;
let lastCrop = null;
let panel;
let log;
let statusLine;
let canvas;

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the mode just does not survive a reload.
  }
}

function fitCanvas() {
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
  return context;
}

function setOn(value) {
  on = value;
  writeStored(value);
  document.body.classList.toggle('is-dev', value);
  panel.hidden = !value;
  canvas.hidden = !value;
  if (value) fitCanvas();
}

export function isDev() {
  return on;
}

export function initDevMode() {
  panel = document.getElementById('dev-panel');
  log = document.getElementById('dev-log');
  statusLine = document.getElementById('dev-status');
  canvas = document.getElementById('dev-boxes');
  document.getElementById('dev-toggle').addEventListener('click', () => setOn(!on));
  document.getElementById('dev-off').addEventListener('click', () => setOn(false));
  document.getElementById('dev-collapse').addEventListener('click', () => panel.classList.toggle('is-collapsed'));
  document.getElementById('dev-clear').addEventListener('click', () => log.replaceChildren());
  setOn(readStored());
}

function drawBox(context, [x, y, width, height], color, label, dashed = false) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  if (dashed) context.setLineDash([6, 4]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.font = '600 11px system-ui, sans-serif';
  const textWidth = context.measureText(label).width + 8;
  const top = Math.max(0, y - 16);
  context.fillStyle = color;
  context.fillRect(x, top, textWidth, 16);
  context.fillStyle = '#111';
  context.textBaseline = 'middle';
  context.fillText(label, x + 4, top + 8);
  context.restore();
}

// detections are in video pixels of `frame`; view is the camera box on screen.
export function drawDevBoxes(detections, status, view, frame) {
  if (!on) return;
  const context = fitCanvas();
  let bodies = 0;
  let faces = 0;
  for (const detection of detections) {
    const box = videoToScreen(detection.bbox, view, frame);
    if (!box) continue;
    if (detection.kind === 'person') {
      faces += 1;
      const emotion = EMOTION_LABELS[detection.emotion] ?? detection.emotion;
      drawBox(context, box, COLORS.face, `лицо: ${emotion}${detection.grudged ? ' · обида' : ''}`);
    } else {
      bodies += 1;
      drawBox(context, box, COLORS.body, `тело ${Math.round((detection.score ?? 0) * 100)}%`, true);
    }
  }
  if (lastCrop && performance.now() - lastCrop.at < CROP_SHOW_MS) {
    const box = videoToScreen(lastCrop.bbox, view, frame);
    if (box) drawBox(context, box, COLORS.crop, 'вырезка → Gemini');
  }
  const mark = (ready) => (ready ? '✓' : '✗');
  statusLine.textContent = `COCO ${mark(status.coco)} · лица ${mark(status.faces)} · тел ${bodies} · лиц ${faces}\n${perfLine(status)}`;
}

function row(kind, title, text, detail) {
  const item = document.createElement('div');
  item.className = `dev-row dev-${kind}`;
  const head = document.createElement('div');
  head.className = 'dev-head';
  head.textContent = title;
  item.append(head);
  if (text) {
    const body = document.createElement('div');
    body.textContent = text;
    item.append(body);
  }
  if (detail) {
    const note = document.createElement('div');
    note.className = 'dev-detail';
    note.textContent = detail;
    item.append(note);
  }
  log.append(item);
  while (log.children.length > MAX_ENTRIES * 2) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  return item;
}

// One line about the loading screen. Logged even with the mode off: it is turned on after the
// fact, and the cold start is what this line measures.
export function logLoad(text) {
  row('load', `Загрузка · ${new Date().toLocaleTimeString('ru-RU')}`, text);
}

// Call before askCat; returns null when the mode is off, so the caller passes no fetchFn.
// For a tap on clothes `image` is the torso crop and `torso` is what torsoSnapshot returned.
export function logAsk(target, image, torso, hero = false) {
  if (!on) return null;
  const cropBox = target.kind === 'object' ? target.bbox : image && target.torsoBox;
  if (cropBox) lastCrop = { bbox: cropBox, at: performance.now() };
  const gate = target.torsoBox && !target.grudge ? gateLine(torso?.gate, Boolean(image)) : undefined;
  const item = row('you', `Тап · ${new Date().toLocaleTimeString('ru-RU')}`, describeTarget(target, hero), gate);
  if (image) {
    const thumb = document.createElement('img');
    thumb.alt = 'Вырезка, которую видит Gemini';
    thumb.src = `data:image/jpeg;base64,${image}`;
    item.append(thumb);
  }
  return { call: { sent: false }, item };
}

// A fetch for askCat that remembers what happened, for the log. It changes nothing in the request.
export function trackedFetch(entry) {
  return async (url, options) => {
    const { call } = entry;
    call.sent = true;
    call.sentAt = performance.now();
    try {
      const response = await fetch(url, options);
      call.status = response.status;
      call.doneAt = performance.now();
      call.rawRead = response
        .clone()
        .text()
        .then((raw) => {
          call.raw = raw;
        })
        .catch(() => {});
      return response;
    } catch (error) {
      call.error = error.name;
      throw error;
    }
  };
}

// `timing`: { snapMs, totalMs } measured in main.js, around the crop and the whole tap.
export async function logReply(entry, reply, timing = {}) {
  if (!entry) return;
  const { call } = entry;
  if (call.rawRead) await Promise.race([call.rawRead, new Promise((resolve) => setTimeout(resolve, RAW_WAIT_MS))]);
  const outcome = askOutcome(call, reply);
  const askMs = call.sentAt ? (call.doneAt ?? performance.now()) - call.sentAt : undefined;
  const took = askMs === undefined ? '' : formatSeconds(askMs);
  const seen = recognitionLine(outcome);
  const title = outcome.ok
    ? `Gemini · ${took} · ${outcome.mood}${seen ? ` · ${seen}` : ''}`
    : `Запасная фраза · ${outcome.reason}${took ? ` · ${took}` : ''}`;
  row(outcome.ok ? 'gemini' : 'fallback', title, reply.text, phasesLine({ ...timing, askMs }));
}
