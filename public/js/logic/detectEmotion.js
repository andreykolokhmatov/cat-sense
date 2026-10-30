// Starting values, not measured: tune them on real faces on the phone.
export const THRESHOLDS = {
  smile: 0.4,
  eyeWide: 0.3,
  jawOpen: 0.25,
  browInnerUp: 0.4,
  browDown: 0.4,
};

// Categories: [{ categoryName, score }] from FaceLandmarker faceBlendshapes.
export function detectEmotion(categories = []) {
  const scores = new Map(categories.map(({ categoryName, score }) => [categoryName, score]));
  const score = (name) => scores.get(name) ?? 0;
  const pair = (name) => (score(`${name}Left`) + score(`${name}Right`)) / 2;

  // Smile goes first: a laugh opens the jaw too and must not read as surprise.
  if (pair('mouthSmile') > THRESHOLDS.smile) return 'happy';

  const raisedFace = score('jawOpen') > THRESHOLDS.jawOpen || score('browInnerUp') > THRESHOLDS.browInnerUp;
  if (pair('eyeWide') > THRESHOLDS.eyeWide && raisedFace) return 'surprised';

  if (pair('browDown') > THRESHOLDS.browDown) return 'angry';
  return 'neutral';
}
