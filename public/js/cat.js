const POSES = {
  want: { src: '/assets/cat/want.webp', emoji: '😻' },
  curious: { src: '/assets/cat/curious.webp', emoji: '🐱' },
  scared: { src: '/assets/cat/scared.webp', emoji: '🙀' },
  happy: { src: '/assets/cat/happy.webp', emoji: '😸' },
  think: { src: '/assets/cat/thinking.webp', emoji: '😼' },
};
const MAX_LEAN_DEG = 10;
const LEAN_MS = 3500;
const BLINK_MS = 150;
const BLINK_GAP_MS = { min: 2500, max: 6000 };

const catEl = document.getElementById('cat');
const catImg = document.getElementById('cat-img');
const bubbleEl = document.getElementById('bubble');
const introCat = document.getElementById('intro-cat');
const introImg = document.getElementById('intro-img');
const emojiEl = document.createElement('span');
catEl.append(emojiEl);
let pose = POSES.curious;
let leanTimer = null;
let audioContext = null;

// A missing picture must not leave an empty corner: the demo falls back to the emoji pose.
function showEmoji() {
  catImg.hidden = true;
  emojiEl.textContent = pose.emoji;
}

catImg.addEventListener('error', showEmoji);
if (catImg.complete && catImg.naturalWidth === 0) showEmoji();

// Preloaded so that switching poses does not flash an empty frame.
for (const { src } of Object.values(POSES)) new Image().src = src;

// Removing the class and forcing a reflow restarts the animation when the same mood repeats.
function restartClass(el, className) {
  el.className = '';
  void el.offsetWidth;
  el.className = className;
}

function show(name) {
  pose = POSES[name] ?? POSES.curious;
  emojiEl.textContent = '';
  catImg.hidden = false;
  catImg.src = pose.src;
  restartClass(catEl, `is-${POSES[name] ? name : 'curious'}`);
}

function setBubble(content) {
  bubbleEl.replaceChildren(content);
  restartClass(bubbleEl, 'is-pop');
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

// The closed-eyes picture is drawn for the calm pose only: on any other pose it would swap the face.
function canBlink(el) {
  if (el === catEl) return pose === POSES.curious && !catImg.hidden && !document.body.classList.contains('is-intro');
  return !introCat.closest('[hidden]') && introImg.src.endsWith(POSES.curious.src);
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

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) scheduleBlink();

export function think() {
  show('think');
  setBubble(thinkingDots());
}

export function say(text, mood) {
  show(mood);
  setBubble(text);
  clearTimeout(leanTimer);
  leanTimer = setTimeout(() => catEl.style.removeProperty('--lean'), LEAN_MS);
}

// Must run synchronously inside the click: after an await Safari no longer treats it as a gesture.
export function unlockAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
  audioContext.resume();
}

// There are no sound files yet, so the cat stays silent.
export function playMeow() {}
