// A figurine or a poster often comes back from COCO as a weak 'person'. Below this score a
// body without a face is treated as a thing, so Gemini gets to name it. Not measured yet:
// check the scores with ?debug on the phone.
export const PERSON_MIN_SCORE = 0.75;
// The chest box is narrower than the COCO body box: that one takes in the arms and the wall
// behind them, and a white wall beside a black shirt would pass the logo gate.
export const TORSO_SHARE = 0.6;

function contains([x, y, width, height], point) {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function area([, , width, height]) {
  return width * height;
}

function center([x, y, width, height]) {
  return { x: x + width / 2, y: y + height / 2 };
}

function isBody(detection) {
  return detection.kind === 'object' && detection.label === 'person';
}

// A body without a score comes from an older detector: trust it rather than send its image.
function isConfident(body) {
  return !(body.score < PERSON_MIN_SCORE);
}

// A square around the tap, kept inside the body: the logo is where the finger is, and a crop
// of the whole body would leave it a few pixels wide.
export function torsoBox(tap, [x, y, width, height]) {
  const side = Math.min(width * TORSO_SHARE, height);
  const left = Math.min(Math.max(tap.x - side / 2, x), x + width - side);
  const top = Math.min(Math.max(tap.y - side / 2, y), y + height - side);
  return [left, top, side, side];
}

// Detections: { kind: 'object', label, bbox, score? } from COCO-SSD and { kind: 'person', emotion,
// bbox, track?, grudged? } from faces. bbox is [x, y, width, height], and the tap must be in the
// same video pixels. A tap on the body rather than the face adds torsoBox: the only place a
// clothes crop may come from, and never from a tap on the face itself.
export function pickTarget(tap, detections) {
  const hits = detections
    .filter((detection) => contains(detection.bbox, tap))
    .sort((a, b) => area(a.bbox) - area(b.bbox));
  for (const hit of hits) {
    if (!isBody(hit)) return hit;
    const face = detections.find(
      (detection) => detection.kind === 'person' && contains(hit.bbox, center(detection.bbox)),
    );
    const torso = torsoBox(tap, hit.bbox);
    if (face) return { ...face, torsoBox: torso };
    // A person without a visible face must stay kind 'person': kind 'object' would send
    // their image to Gemini, and only the emotion name may leave the phone.
    if (isConfident(hit)) return { kind: 'person', emotion: 'neutral', bbox: hit.bbox, torsoBox: torso };
  }
  return null;
}
