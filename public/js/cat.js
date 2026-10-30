const POSES = { want: '😻', curious: '🐱', scared: '🙀', happy: '😸' };
const THINKING_POSE = '😼';
const THINKING_TEXT = 'Хм...';

const catEl = document.getElementById('cat');
const bubbleEl = document.getElementById('bubble');
let audioContext = null;

catEl.textContent = POSES.curious;

export function think() {
  catEl.textContent = THINKING_POSE;
  bubbleEl.textContent = THINKING_TEXT;
}

export function say(text, mood) {
  catEl.textContent = POSES[mood] ?? POSES.curious;
  bubbleEl.textContent = text;
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
