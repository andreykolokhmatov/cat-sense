import { EQUIP_FRAMES, POSE_NAMES, allPoseSrcs, poseSrc } from './logic/catPoses.js';
import { dbToGain, pickSound, soundNames, soundPath } from './logic/sounds.js';

// Below the cat's voice is room rumble, above it the hiss of a cheap microphone.
const VOICE_BAND_HZ = { low: 180, high: 7000 };
// Quiet enough not to startle a visitor holding the phone at arm's length.
const MASTER_VOLUME = 0.8;
const FADE_IN_S = 0.015;
const FADE_OUT_S = 0.08;
const MUTED_KEY = 'cat-sense-muted';

const EMOJI = { want: '😻', curious: '🐱', scared: '🙀', happy: '😸', think: '😼', grudge: '😾' };
const MAX_LEAN_DEG = 10;
const LEAN_MS = 3500;
const BLINK_MS = 150;
const BLINK_GAP_MS = { min: 2500, max: 6000 };
// Long replies type faster so the whole line never takes more than TYPE_MAX_MS.
const TYPE_CHAR_MS = 18;
const TYPE_MAX_MS = 550;
// Each size is one reflow, so the list stays short; 13px still fits about 12 words on a 375px phone.
const BUBBLE_FONT_PX = [16, 14, 13, 12];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const catEl = document.getElementById('cat');
const catImg = document.getElementById('cat-img');
const bubbleEl = document.getElementById('bubble');
const bubbleText = bubbleEl.querySelector('.bubble-text');
const introCat = document.getElementById('intro-cat');
const introImg = document.getElementById('intro-img');
const emojiEl = document.createElement('span');
catEl.append(emojiEl);
let poseName = 'curious';
let masked = false;
let maskOffPending = false;
let equipTimer = null;
let leanTimer = null;
let typeTimer = null;
let audioContext = null;
let voice = null;
let currentClip = null;
let lastSound = null;
const clips = new Map();

// A missing picture must not leave an empty corner: the demo falls back to the emoji pose.
function showEmoji() {
  catImg.hidden = true;
  emojiEl.textContent = EMOJI[poseName];
}

catImg.addEventListener('error', showEmoji);
if (catImg.complete && catImg.naturalWidth === 0) showEmoji();

// Preloaded so that switching poses does not flash an empty frame.
for (const src of allPoseSrcs()) new Image().src = src;

// The frames of putting the mask on stay in the DOM, hidden but decoded, so no frame waits for
// its picture.
const equipImgs = EQUIP_FRAMES.map(({ src }) => {
  const img = document.createElement('img');
  img.className = 'equip';
  img.alt = '';
  img.draggable = false;
  img.src = src;
  img.decode?.().catch(() => {});
  catEl.append(img);
  return img;
});

// Removing the class and forcing a reflow restarts the animation when the same mood repeats.
function restartClass(el, className) {
  el.className = '';
  void el.offsetWidth;
  el.className = className;
}

function show(name) {
  stopEquip();
  if (maskOffPending) {
    masked = false;
    maskOffPending = false;
  }
  poseName = POSE_NAMES.includes(name) ? name : 'curious';
  emojiEl.textContent = '';
  catImg.hidden = false;
  catImg.src = poseSrc(poseName, masked);
  restartClass(catEl, `is-${poseName}`);
}

function stopEquip() {
  if (equipTimer === null) return;
  clearTimeout(equipTimer);
  equipTimer = null;
  delete catEl.dataset.equip;
  for (const img of equipImgs) img.classList.remove('is-on');
}

function playEquip(index) {
  equipImgs.forEach((img, i) => img.classList.toggle('is-on', i === index));
  equipTimer = setTimeout(() => {
    if (index + 1 < equipImgs.length) return playEquip(index + 1);
    stopEquip();
    show('curious');
  }, EQUIP_FRAMES[index].ms);
}

// The mask counts as on from the first frame: a tap during the animation cuts it short and the
// cat answers already masked. A frame that has not loaded would blink empty, so then the cat
// just appears in the mask.
function putMaskOn() {
  maskOffPending = false;
  if (masked) return;
  masked = true;
  const ready = equipImgs.every((img) => img.complete && img.naturalWidth > 0);
  if (reducedMotion || catImg.hidden || !ready) return show('curious');
  show('curious');
  restartClass(catEl, 'is-equip');
  catEl.dataset.equip = '';
  playEquip(0);
}

// The last masked answer is said and then the mask is counted out in the same breath. Swapping
// the picture there would show that very answer, say the angry one, without the mask: it would
// look like the mask flew off mid-emotion. So the mask comes off with the next answer. The
// timer has no answer to protect and takes it off at once.
function takeMaskOff({ detail } = {}) {
  if (!masked) return;
  if (detail?.after === 'tap') {
    maskOffPending = true;
    return;
  }
  masked = false;
  stopEquip();
  if (!catImg.hidden) catImg.src = poseSrc(poseName);
}

document.addEventListener('cat:hero', putMaskOn);
document.addEventListener('cat:hero-off', takeMaskOff);

function overflows() {
  return bubbleText.scrollHeight > bubbleText.clientHeight + 1;
}

// The bubble cannot grow past its grid row, so a long line takes a smaller font instead.
// Past the smallest font the text is cut on a whole line, not through the middle of one.
function fitBubble() {
  bubbleText.style.webkitLineClamp = '';
  for (const size of BUBBLE_FONT_PX) {
    bubbleEl.style.fontSize = `${size}px`;
    if (!overflows()) return;
  }
  const lineHeight = parseFloat(getComputedStyle(bubbleText).lineHeight);
  if (lineHeight > 0) bubbleText.style.webkitLineClamp = String(Math.max(1, Math.floor(bubbleText.clientHeight / lineHeight)));
}

function setBubble(...content) {
  clearInterval(typeTimer);
  bubbleEl.removeAttribute('aria-busy');
  bubbleText.replaceChildren(...content);
  fitBubble();
  restartClass(bubbleEl, 'is-pop');
}

window.addEventListener('resize', fitBubble);

// The untyped rest stays in the layout but invisible, so the bubble opens at its final size
// instead of growing and jumping line by line. aria-busy keeps screen readers from reading
// every letter.
function typeBubble(text) {
  const chars = Array.from(text);
  if (reducedMotion || chars.length < 2) return setBubble(text);
  const typed = document.createElement('span');
  const rest = document.createElement('span');
  rest.style.visibility = 'hidden';
  rest.textContent = text;
  setBubble(typed, rest);
  bubbleEl.setAttribute('aria-busy', 'true');

  let shown = 0;
  typeTimer = setInterval(() => {
    shown += 1;
    typed.textContent = chars.slice(0, shown).join('');
    rest.textContent = chars.slice(shown).join('');
    if (shown < chars.length) return;
    clearInterval(typeTimer);
    bubbleEl.removeAttribute('aria-busy');
  }, Math.min(TYPE_CHAR_MS, TYPE_MAX_MS / chars.length));
}

function thinkingDots() {
  const dots = document.createElement('span');
  dots.className = 'dots';
  dots.setAttribute('role', 'img');
  dots.setAttribute('aria-label', 'Кот думает');
  dots.append(...Array.from({ length: 3 }, () => document.createElement('i')));
  return dots;
}

// The cat sits in the corner, so it tilts from its paws toward the tapped point.
export function lookAt(x, y) {
  const rect = catEl.getBoundingClientRect();
  const dx = x - (rect.left + rect.width / 2);
  const dy = rect.top + rect.height / 2 - y;
  const degrees = (Math.atan2(dx, Math.max(dy, 1)) * 180) / Math.PI;
  const lean = Math.max(-MAX_LEAN_DEG, Math.min(MAX_LEAN_DEG, degrees / 4.5));
  clearTimeout(leanTimer);
  catEl.style.setProperty('--lean', `${lean}deg`);
}

// The closed-eyes picture is drawn for the calm pose without the mask only: on anything else it
// would swap the face.
function canBlink(el) {
  if (el === catEl) return poseName === 'curious' && !masked && !catImg.hidden && !document.body.classList.contains('is-intro');
  return !introCat.closest('[hidden]') && introImg.src.endsWith(poseSrc('curious'));
}

function blink() {
  for (const el of [catEl, introCat]) {
    if (!el || !canBlink(el)) continue;
    el.classList.add('is-blink');
    setTimeout(() => el.classList.remove('is-blink'), BLINK_MS);
  }
}

// Random gaps keep the blinking from looking mechanical.
function scheduleBlink() {
  const gap = BLINK_GAP_MS.min + Math.random() * (BLINK_GAP_MS.max - BLINK_GAP_MS.min);
  setTimeout(() => {
    blink();
    scheduleBlink();
  }, gap);
}

if (!reducedMotion) scheduleBlink();

export function think() {
  show('think');
  setBubble(thinkingDots());
}

export function say(text, mood) {
  show(mood);
  typeBubble(text);
  clearTimeout(leanTimer);
  leanTimer = setTimeout(() => catEl.style.removeProperty('--lean'), LEAN_MS);
}

// The clips come from different recordings: one shared filter takes off the room rumble below
// and the hiss above, so they sound as if from the same throat and the same microphone.
function voiceOutput() {
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = VOICE_BAND_HZ.low;
  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = VOICE_BAND_HZ.high;
  const master = audioContext.createGain();
  master.gain.value = MASTER_VOLUME;
  highpass.connect(lowpass).connect(master).connect(audioContext.destination);
  return highpass;
}

async function loadSounds() {
  await Promise.all(
    soundNames().map(async (name) => {
      try {
        const response = await fetch(soundPath(name));
        clips.set(name, await audioContext.decodeAudioData(await response.arrayBuffer()));
      } catch (error) {
        console.warn(`Sound ${name} is unavailable`, error);
      }
    }),
  );
}

// Must run synchronously inside the click: after an await Safari no longer treats it as a gesture.
export function unlockAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  // Without this an iPhone with the mute switch on plays nothing, and on the stand nobody checks it.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  audioContext = new AudioContextClass();
  audioContext.resume();
  voice = voiceOutput();
  loadSounds();
}

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readMuted();

export function isMuted() {
  return muted;
}

// Remembered on this phone: a visitor who turned the cat off should not hear it after a reload.
export function setMuted(value) {
  muted = value;
  if (muted) currentClip?.stop();
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1');
    else localStorage.removeItem(MUTED_KEY);
  } catch {
    // Private mode: the choice only lasts until the page closes.
  }
}

// Plays a clip for the mood with a short fade in and out, cutting off the one still playing.
// Silent when muted, until the clips have loaded, and for a mood without a clip.
export function playMeow(mood) {
  if (muted) return;
  const sound = audioContext && pickSound(mood, lastSound);
  const buffer = sound && clips.get(sound.src);
  if (!buffer) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  currentClip?.stop();

  const now = audioContext.currentTime;
  const end = Math.min(sound.end, buffer.duration);
  const length = (end - sound.start) / sound.rate;
  const level = dbToGain(sound.gainDb);
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(level, now + FADE_IN_S);
  gain.gain.setValueAtTime(level, now + Math.max(FADE_IN_S, length - FADE_OUT_S));
  gain.gain.linearRampToValueAtTime(0, now + length);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = sound.rate;
  source.connect(gain).connect(voice);
  // offset and duration are in the clip's own time; the rate changes how long it plays.
  source.start(now, sound.start, end - sound.start);
  currentClip = source;
  lastSound = sound;
}

// What the cat shows right now, for the saved photo. The thinking dots have no text, so a
// photo taken mid-thought gets no bubble.
export function currentLine() {
  return { text: bubbleEl.textContent.trim(), img: catImg.hidden ? null : catImg };
}
