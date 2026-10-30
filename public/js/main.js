import { startCamera } from './camera.js';
import { startCatView } from './catView.js';
import { currentLine, lookAt, playMeow, say, think, unlockAudio } from './cat.js';
import { faceTracks, getDetections, markGrudge, onDetections, startDetection } from './detect.js';
import { askCat } from './logic/askCat.js';
import { screenToVideo, videoFrame } from './logic/coverMap.js';
import { tapBox } from './logic/cropRegion.js';
import { grudgeMarks } from './logic/grudgeMarks.js';
import { pickTarget } from './logic/pickTarget.js';
import { drawMarks } from './marks.js';
import { saveFrame } from './saveFrame.js';
import { snapshot } from './snapshot.js';

// A fallback phrase comes back instantly; without a pause the dots would only flicker.
const MIN_THINK_MS = 700;
// A slow or missing cat picture must not keep the intro bubble hidden for long.
const INTRO_WAIT_MS = 1500;
// Starting values for the hold that makes the cat take offence; tune them on the iPhone.
const LONG_PRESS_MS = 600;
const MOVE_SLOP_PX = 12;
const MINIMAL_PHRASES = { objects: {}, emotions: {}, fallback: { mood: 'curious', lines: ['Мяу?'] } };

const video = document.getElementById('video');
// The canvas over the video is the tap surface; only the grudge marks are drawn on it.
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start');
const intro = document.getElementById('intro');
const introBubble = document.getElementById('intro-bubble');
const introImg = document.getElementById('intro-img');
const debugCrop = document.getElementById('debug-crop');
const catCanvas = document.getElementById('catview');
const visionButton = document.getElementById('vision-button');
const visionLabel = document.getElementById('vision-label');
const infoDialog = document.getElementById('info');
const params = new URLSearchParams(window.location.search);
const debug = params.has('debug');

let phrases = MINIMAL_PHRASES;
let lastText = null;
let busy = false;
let catView = null;
let press = null;

async function loadPhrases() {
  try {
    const response = await fetch('/phrases.json');
    if (response.ok) phrases = await response.json();
  } catch (error) {
    console.warn('phrases.json is unavailable', error);
  }
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showIntro() {
  const decoded = introImg.decode?.().catch(() => {}) ?? Promise.resolve();
  Promise.race([decoded, pause(INTRO_WAIT_MS)]).then(() => intro.classList.add('is-ready'));
}

function tapInVideo(point) {
  const rect = video.getBoundingClientRect();
  return screenToVideo({ x: point.x - rect.left, y: point.y - rect.top }, rect, videoFrame(video));
}

function redrawMarks() {
  const { width, height } = video.getBoundingClientRect();
  drawMarks(overlay, grudgeMarks(faceTracks(), { width, height }, videoFrame(video)));
}

function showDebugCrop(image) {
  debugCrop.src = `data:image/jpeg;base64,${image}`;
  debugCrop.hidden = false;
}

function targetAt(tap) {
  return pickTarget(tap, getDetections()) ?? { kind: 'object', label: 'unknown', bbox: tapBox(tap) };
}

async function respond(target, point) {
  busy = true;
  lookAt(point.x, point.y);
  think();
  const image = target.kind === 'object' ? snapshot(video, target) : null;
  if (debug && image) showDebugCrop(image);

  const [{ text, mood }] = await Promise.all([askCat({ target, image, phrases, lastText }), pause(MIN_THINK_MS)]);
  // The model picks a mood by the words; an offended cat must look offended whatever it said.
  say(text, target.grudge ? 'grudge' : mood);
  playMeow();
  lastText = text;
  busy = false;
}

function handleTap(point) {
  if (busy) return;
  const tap = tapInVideo(point);
  if (!tap) return;
  const target = targetAt(tap);
  respond(target.kind === 'person' && target.grudged ? { ...target, grudge: 'again' } : target, point);
}

// A body without a face has no track: the cat still takes offence, but there is no mark and
// nothing to remember.
function handleLongPress(point) {
  if (busy) return;
  const tap = tapInVideo(point);
  if (!tap) return;
  const target = targetAt(tap);
  if (target.kind !== 'person') return respond(target, point);
  if (target.track) {
    markGrudge(target.track);
    redrawMarks();
  }
  respond({ ...target, grudge: 'start' }, point);
}

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
}

function onPointerDown(event) {
  if (!event.isPrimary || event.button > 0 || press) return;
  // Capture keeps up and cancel coming here even if the finger slides onto the panel.
  overlay.setPointerCapture?.(event.pointerId);
  const point = { x: event.clientX, y: event.clientY };
  press = {
    id: event.pointerId,
    point,
    timer: setTimeout(() => {
      press = null;
      handleLongPress(point);
    }, LONG_PRESS_MS),
  };
}

function onPointerMove(event) {
  if (!press || event.pointerId !== press.id) return;
  if (Math.hypot(event.clientX - press.point.x, event.clientY - press.point.y) > MOVE_SLOP_PX) cancelPress();
}

function onPointerUp(event) {
  if (!press || event.pointerId !== press.id) return;
  const { point } = press;
  cancelPress();
  handleTap(point);
}

function onPointerCancel(event) {
  if (press && event.pointerId === press.id) cancelPress();
}

function listenToTaps() {
  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('pointermove', onPointerMove);
  overlay.addEventListener('pointerup', onPointerUp);
  overlay.addEventListener('pointercancel', onPointerCancel);
  overlay.addEventListener('contextmenu', (event) => event.preventDefault());
}

function setCatMode(on) {
  document.body.classList.toggle('is-cat', on);
  visionButton.setAttribute('aria-pressed', String(on));
  visionLabel.textContent = on ? 'Кошка' : 'Человек';
}

function liveCatView() {
  return document.body.classList.contains('is-cat') && !document.body.classList.contains('is-cat-css');
}

// No await before saveFrame: Safari opens the share sheet only inside the tap itself.
function handleSave() {
  if (!video.videoWidth) return;
  const { width, height } = video.getBoundingClientRect();
  const { text, img } = currentLine();
  const catMode = document.body.classList.contains('is-cat');
  // Drawn again right here: a WebGL canvas is only readable in the task that drew it.
  const fresh = liveCatView() && catView?.render() ? catCanvas : null;
  try {
    saveFrame({ video, view: { width, height }, catMode, catCanvas: fresh, catImg: img, text });
  } catch (error) {
    console.warn('Saving the frame failed', error);
    say('Не получилось сохранить. Попробуй ещё раз.', 'scared');
  }
}

function useCssCatVision() {
  document.body.classList.add('is-cat-css');
}

// A click on the dialog element itself is a click on the backdrop: the content has its own box.
function closeOnBackdrop(event) {
  if (event.target === infoDialog) infoDialog.close();
}

function setUpPanel() {
  // ?catcss forces the plain CSS filter, to compare with the WebGL one on a phone.
  if (params.has('catcss')) useCssCatVision();
  visionButton.addEventListener('click', () => setCatMode(!document.body.classList.contains('is-cat')));
  document.getElementById('save-button').addEventListener('click', handleSave);
  document.getElementById('info-button').addEventListener('click', () => {
    infoDialog.showModal();
    // Safari may ignore autofocus inside a dialog; the text must still start at the top.
    infoDialog.scrollTop = 0;
  });
  infoDialog.addEventListener('click', closeOnBackdrop);
}

async function handleStart() {
  unlockAudio();
  startButton.disabled = true;
  const problem = await startCamera(video);
  if (problem) {
    introBubble.textContent = problem;
    introImg.src = '/assets/cat/scared.webp';
    intro.classList.add('is-ready');
    startButton.disabled = false;
    return;
  }
  intro.hidden = true;
  document.body.classList.remove('is-intro');
  say('Мяу! Тапни по чему-нибудь.', 'happy');
  startDetection(video);
  if (!params.has('catcss')) {
    catView = startCatView(catCanvas, video, { isOn: liveCatView, onFail: useCssCatVision });
    if (!catView) useCssCatVision();
  }
  listenToTaps();
  onDetections(redrawMarks);
  window.addEventListener('resize', redrawMarks);
}

showIntro();
loadPhrases();
setUpPanel();
startButton.addEventListener('click', handleStart);
