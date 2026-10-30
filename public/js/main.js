import { startCamera } from './camera.js';
import { currentLine, lookAt, playMeow, say, think, unlockAudio } from './cat.js';
import { getDetections, startDetection } from './detect.js';
import { askCat } from './logic/askCat.js';
import { CAT_BLUR_PX, CAT_MATRIX, toFeColorMatrixValues } from './logic/catVision.js';
import { screenToVideo, videoFrame } from './logic/coverMap.js';
import { tapBox } from './logic/cropRegion.js';
import { pickTarget } from './logic/pickTarget.js';
import { saveFrame } from './saveFrame.js';
import { snapshot } from './snapshot.js';

// A fallback phrase comes back instantly; without a pause the dots would only flicker.
const MIN_THINK_MS = 700;
const MINIMAL_PHRASES = { objects: {}, emotions: {}, fallback: { mood: 'curious', lines: ['Мяу?'] } };

const video = document.getElementById('video');
// The empty canvas over the video is only the tap surface; nothing is drawn on it.
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start');
const intro = document.getElementById('intro');
const introBubble = document.getElementById('intro-bubble');
const introImg = document.getElementById('intro-img');
const debugCrop = document.getElementById('debug-crop');
const visionButton = document.getElementById('vision-button');
const visionLabel = document.getElementById('vision-label');
const infoDialog = document.getElementById('info');
const params = new URLSearchParams(window.location.search);
const debug = params.has('debug');

let phrases = MINIMAL_PHRASES;
let lastText = null;
let busy = false;

async function loadPhrases() {
  try {
    const response = await fetch('/phrases.json');
    if (response.ok) phrases = await response.json();
  } catch (error) {
    console.warn('phrases.json is unavailable', error);
  }
}

function tapInVideo(event) {
  const rect = video.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  return screenToVideo(point, rect, videoFrame(video));
}

function showDebugCrop(image) {
  debugCrop.src = `data:image/jpeg;base64,${image}`;
  debugCrop.hidden = false;
}

async function handleTap(event) {
  if (busy) return;
  const tap = tapInVideo(event);
  if (!tap) return;

  busy = true;
  const target = pickTarget(tap, getDetections()) ?? { kind: 'object', label: 'unknown', bbox: tapBox(tap) };
  lookAt(event.clientX, event.clientY);
  think();
  const image = target.kind === 'object' ? snapshot(video, target) : null;
  if (debug && image) showDebugCrop(image);

  const minThink = new Promise((resolve) => setTimeout(resolve, MIN_THINK_MS));
  const [{ text, mood }] = await Promise.all([askCat({ target, image, phrases, lastText }), minThink]);
  say(text, mood);
  playMeow();
  lastText = text;
  busy = false;
}

function setCatMode(on) {
  document.body.classList.toggle('is-cat', on);
  visionButton.setAttribute('aria-pressed', String(on));
  visionLabel.textContent = on ? 'Кошка' : 'Человек';
}

// No await before saveFrame: Safari opens the share sheet only inside the tap itself.
function handleSave() {
  if (!video.videoWidth) return;
  const { width, height } = video.getBoundingClientRect();
  const { text, img } = currentLine();
  saveFrame({ video, view: { width, height }, catMode: document.body.classList.contains('is-cat'), catImg: img, text });
}

// A click on the dialog element itself is a click on the backdrop: the content has its own box.
function closeOnBackdrop(event) {
  if (event.target === infoDialog) infoDialog.close();
}

function setUpPanel() {
  document.getElementById('cat-matrix').setAttribute('values', toFeColorMatrixValues(CAT_MATRIX));
  document.documentElement.style.setProperty('--cat-blur', `${CAT_BLUR_PX}px`);
  // ?catcss switches to the plain CSS filter, for phones where the SVG filter misbehaves.
  document.body.classList.toggle('is-cat-css', params.has('catcss'));
  visionButton.addEventListener('click', () => setCatMode(!document.body.classList.contains('is-cat')));
  document.getElementById('save-button').addEventListener('click', handleSave);
  document.getElementById('info-button').addEventListener('click', () => infoDialog.showModal());
  infoDialog.addEventListener('click', closeOnBackdrop);
}

async function handleStart() {
  unlockAudio();
  startButton.disabled = true;
  const problem = await startCamera(video);
  if (problem) {
    introBubble.textContent = problem;
    introImg.src = '/assets/cat/scared.webp';
    startButton.disabled = false;
    return;
  }
  intro.hidden = true;
  document.body.classList.remove('is-intro');
  say('Мяу! Тапни по чему-нибудь.', 'happy');
  startDetection(video);
  overlay.addEventListener('click', handleTap);
}

loadPhrases();
setUpPanel();
startButton.addEventListener('click', handleStart);
