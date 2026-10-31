import { startCamera } from './camera.js';
import { startCatView } from './catView.js';
import { currentLine, isMuted, lookAt, playMeow, say, setMuted, think, unlockAudio } from './cat.js';
import { detectStats, faceTracks, getDetections, markGrudge, modelStatus, onDetections, startDetection } from './detect.js';
import { drawDevBoxes, initDevMode, isDev, logAsk, logLoad, logReply, trackedFetch } from './devMode.js';
import { runLoading } from './loadingScreen.js';
import { askCat } from './logic/askCat.js';
import { screenToVideo, videoFrame } from './logic/coverMap.js';
import { tapBox } from './logic/cropRegion.js';
import { grudgeMarks } from './logic/grudgeMarks.js';
import { HERO_OFF, heroStep, isMasked } from './logic/heroMask.js';
import { pickTarget } from './logic/pickTarget.js';
import { drawMarks } from './marks.js';
import { startPreload, takePreloaded } from './preload.js';
import { saveFrame } from './saveFrame.js';
import { snapshot, torsoSnapshot } from './snapshot.js';
import { startWarmup } from './warmup.js';

// A fallback phrase comes back instantly; without a pause the dots would only flicker. A real
// answer takes longer than this anyway, so it never adds to a model reply.
const MIN_THINK_MS = 400;
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
const visionButtons = document.querySelectorAll('[data-vision]');
const infoDialog = document.getElementById('info');
const params = new URLSearchParams(window.location.search);
const debug = params.has('debug');

let phrases = MINIMAL_PHRASES;
let lastText = null;
let busy = false;
let catView = null;
let press = null;
let loading = false;
let hero = HERO_OFF;
let heroTimer;

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

function redrawDev() {
  if (!isDev()) return;
  const { width, height } = video.getBoundingClientRect();
  const status = { ...modelStatus(), ...detectStats(), cat: liveCatView() ? catView?.stats() : null };
  drawDevBoxes(getDetections(), status, { width, height }, videoFrame(video));
}

function showDebugCrop(image) {
  debugCrop.src = `data:image/jpeg;base64,${image}`;
  debugCrop.hidden = false;
}

function targetAt(tap) {
  return pickTarget(tap, getDetections()) ?? { kind: 'object', label: 'unknown', bbox: tapBox(tap) };
}

// The hero mask is a body class plus two document events, so the cat's look and animation
// can follow it without main.js knowing how the mask is drawn.
function heroEvent(event, text) {
  const wasOn = hero.on;
  hero = heroStep(hero, event);
  clearTimeout(heroTimer);
  if (hero.on) {
    heroTimer = setTimeout(() => heroEvent({ type: 'tick', now: performance.now() }), Math.max(0, hero.until - performance.now()));
  }
  document.body.classList.toggle('is-hero', hero.on);
  if (event.type === 'hero') document.dispatchEvent(new CustomEvent('cat:hero', { detail: { text } }));
  else if (wasOn && !hero.on) document.dispatchEvent(new CustomEvent('cat:hero-off'));
}

// An offended cat never looks at clothes, so a grudge never cuts a torso crop.
function wantsTorso(target) {
  return target.kind === 'person' && target.grudge == null && Boolean(target.torsoBox);
}

async function respond(target, point) {
  busy = true;
  const tappedAt = performance.now();
  // Taken before this tap is counted: every answer while the mask is on is asked in the mask.
  const masked = isMasked(hero, tappedAt);
  lookAt(point.x, point.y);
  think();
  const image = target.kind === 'object' ? snapshot(video, target) : null;
  const torsoShot = wantsTorso(target) ? torsoSnapshot(video, target.torsoBox) : null;
  const torso = torsoShot?.image ?? null;
  const snapMs = performance.now() - tappedAt;
  const crop = image ?? torso;
  if (debug && crop) showDebugCrop(crop);
  const devEntry = logAsk(target, crop, torsoShot, masked);
  redrawDev();

  const ask = askCat({ target, image, torso, hero: masked, phrases, lastText, ...(devEntry && { fetchFn: trackedFetch(devEntry) }) });
  const [{ text, mood, hero: isHero }] = await Promise.all([ask, pause(MIN_THINK_MS)]);
  const cut = image || torsoShot;
  logReply(devEntry, { text, mood }, { snapMs: cut ? snapMs : undefined, totalMs: performance.now() - tappedAt });
  // The model picks a mood by the words; an offended cat must look offended whatever it said.
  const shownMood = target.grudge ? 'grudge' : mood;
  say(text, shownMood);
  playMeow(shownMood);
  lastText = text;
  heroEvent({ type: isHero ? 'hero' : 'tap', now: performance.now() }, text);
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
  for (const button of visionButtons) button.setAttribute('aria-pressed', String((button.dataset.vision === 'cat') === on));
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
  const fresh = liveCatView() && catView?.render({ full: true }) ? catCanvas : null;
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
  for (const button of visionButtons) button.addEventListener('click', () => setCatMode(button.dataset.vision === 'cat'));
  const soundButton = document.getElementById('sound-button');
  const showSound = () => soundButton.setAttribute('aria-pressed', String(!isMuted()));
  showSound();
  soundButton.addEventListener('click', () => {
    setMuted(!isMuted());
    showSound();
  });
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
  startWarmup();
  loading = true;
  const ready = startDetection(video, takePreloaded());
  if (!params.has('catcss')) {
    // Hidden under the intro while loading: drawing there would only take time from the models.
    catView = startCatView(catCanvas, video, { isOn: () => liveCatView() && !loading, onFail: useCssCatVision });
    if (!catView) useCssCatVision();
  }
  const { summary } = await runLoading(ready);
  loading = false;
  logLoad(summary);
  intro.hidden = true;
  document.body.classList.remove('is-intro');
  say('Мяу! Тапни по чему-нибудь.', 'happy');
  playMeow('greet');
  listenToTaps();
  onDetections(redrawMarks);
  onDetections(redrawDev);
  window.addEventListener('resize', redrawMarks);
}

initDevMode();
showIntro();
startPreload();
loadPhrases();
setUpPanel();
startButton.addEventListener('click', handleStart);
