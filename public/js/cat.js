const POSES = {
  want: { src: '/assets/cat/want.webp', emoji: '😻' },
  curious: { src: '/assets/cat/curious.webp', emoji: '🐱' },
  scared: { src: '/assets/cat/scared.webp', emoji: '🙀' },
  happy: { src: '/assets/cat/happy.webp', emoji: '😸' },
  think: { src: '/assets/cat/thinking.webp', emoji: '😼' },
};
const THINKING_TEXT = 'Хм...';

const catEl = document.getElementById('cat');
const catImg = document.getElementById('cat-img');
const bubbleEl = document.getElementById('bubble');
const emojiEl = document.createElement('span');
catEl.append(emojiEl);
let pose = POSES.curious;
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

function setBubble(text) {
  bubbleEl.textContent = text;
  restartClass(bubbleEl, 'is-pop');
}

export function think() {
  show('think');
  setBubble(THINKING_TEXT);
}

export function say(text, mood) {
  show(mood);
  setBubble(text);
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
