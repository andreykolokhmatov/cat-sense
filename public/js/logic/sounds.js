// The cat's voice: nine clips cut from four recordings with scripts/trim-mp3.mjs, tuned to
// sound like one cat. Calibrated on the real output (gain, rate and the voice filter in cat.js):
// - gainDb brings the loud part of every meow to about -22 dB RMS and the two screams to
//   -25 dB, since a scream at the same level sounds much louder than a meow;
// - rate shifts the pitch towards 770 Hz, the voice most clips already share (it also shortens
//   or stretches the clip a little). curious stays higher, a questioning chirp. grudge-1 is a
//   deeper cat at 375 Hz: an octave up would sound like a cartoon, so it is raised only to
//   about 430 Hz and kept, with grudge-2, for the grumpy offended cat;
// - start and end (seconds, in the file) skip the frames kept before the sound and the silence after.
export const SOUNDS = {
  greet: [{ src: 'greet', gainDb: 2.4, rate: 1.07, start: 0.06, end: 0.83 }],
  want: [
    { src: 'want-1', gainDb: 1.5, rate: 0.92, start: 0.08, end: 1.0 },
    { src: 'want-2', gainDb: 4.4, rate: 1.02, start: 0.07, end: 0.86 },
  ],
  curious: [{ src: 'curious', gainDb: -3.3, rate: 0.85, start: 0.02, end: 0.57 }],
  happy: [{ src: 'happy', gainDb: 1.0, rate: 1.06, start: 0.07, end: 0.84 }],
  scared: [
    { src: 'scared-1', gainDb: -10.3, rate: 1, start: 0.14, end: 0.97 },
    { src: 'scared-2', gainDb: -9.4, rate: 1, start: 0.14, end: 1.08 },
  ],
  grudge: [
    { src: 'grudge-1', gainDb: 3.8, rate: 1.2, start: 0.09, end: 0.57 },
    { src: 'grudge-2', gainDb: 2.5, rate: 0.9, start: 0.01, end: 0.65 },
  ],
};

export function soundPath(name) {
  return `/assets/sounds/${name}.mp3`;
}

export function soundNames() {
  return [...new Set(Object.values(SOUNDS).flatMap((variants) => variants.map((sound) => sound.src)))];
}

export function dbToGain(db) {
  return 10 ** (db / 20);
}

// A clip for the mood, never the same one twice in a row when there is a choice. A mood without
// clips of its own (thinking) gets nothing; an unknown one falls back to the curious meow.
export function pickSound(mood, last = null, random = Math.random) {
  if (mood === 'think') return null;
  const variants = SOUNDS[mood] ?? SOUNDS.curious;
  const choices = variants.length > 1 ? variants.filter((sound) => sound !== last) : variants;
  return choices[Math.floor(random() * choices.length)];
}

// How long the clip lasts when played: the rate shortens or stretches it.
export function playedSeconds(sound) {
  return (sound.end - sound.start) / sound.rate;
}
