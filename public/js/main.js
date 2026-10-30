import { startCamera } from './camera.js';
import { lookAt, playMeow, say, think, unlockAudio } from './cat.js';
import { getDetections, startDetection } from './detect.js';
import { askCat } from './logic/askCat.js';
import { screenToVideo, videoFrame } from './logic/coverMap.js';
import { tapBox } from './logic/cropRegion.js';
import { pickTarget } from './logic/pickTarget.js';
import { startOverlay } from './overlay.js';
import { snapshot } from './snapshot.js';

const MINIMAL_PHRASES = { objects: {}, emotions: {}, fallback: { mood: 'curious', lines: ['Мяу?'] } };

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const startButton = document.getElementById('start');
const intro = document.getElementById('intro');
const introBubble = document.getElementById('intro-bubble');
const introImg = document.getElementById('intro-img');
const debugCrop = document.getElementById('debug-crop');
const debug = new URLSearchParams(window.location.search).has('debug');

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

  const { text, mood } = await askCat({ target, image, phrases, lastText });
  say(text, mood);
  playMeow();
  lastText = text;
  busy = false;
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
  startDetection(video, startOverlay(overlay, video, getDetections));
  overlay.addEventListener('click', handleTap);
}

loadPhrases();
startButton.addEventListener('click', handleStart);
