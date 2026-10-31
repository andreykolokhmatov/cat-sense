// Which picture the cat shows for a mood, with and without the hero mask, and the frames of
// putting the mask on. No DOM here, so the tables are covered by tests.

const DIR = '/assets/cat/';

// The grudge has its own angry face now; it no longer borrows the mirrored pensive pose.
const PLAIN = {
  want: 'want',
  curious: 'curious',
  scared: 'scared',
  happy: 'happy',
  think: 'thinking',
  grudge: 'angry',
};

// No masked "want" was drawn: the pleading paws of the masked sad cat read the same way.
const MASKED = {
  want: 'mask-want',
  curious: 'mask-curious',
  scared: 'mask-scared',
  happy: 'mask-happy',
  think: 'mask-thinking',
  grudge: 'mask-angry',
};

export const POSE_NAMES = Object.freeze(Object.keys(PLAIN));

export function poseSrc(name, masked = false) {
  const table = masked ? MASKED : PLAIN;
  return `${DIR}${table[name] ?? table.curious}.webp`;
}

// Played once when the mask goes on. The frames are aligned on the hind paws; equip-2 has extra
// room on top for the mask held over the head, so frames are anchored to the bottom.
export const EQUIP_FRAMES = Object.freeze([
  { src: poseSrc('curious'), ms: 250 },
  { src: `${DIR}equip-1.webp`, ms: 250 },
  { src: `${DIR}equip-2.webp`, ms: 300 },
  { src: `${DIR}equip-3.webp`, ms: 350 },
  { src: `${DIR}equip-4.webp`, ms: 250 },
  { src: poseSrc('curious', true), ms: 350 },
]);

export function allPoseSrcs() {
  return [...new Set([...POSE_NAMES.flatMap((name) => [poseSrc(name), poseSrc(name, true)]), ...EQUIP_FRAMES.map((frame) => frame.src)])];
}
