// A figurine or a poster often comes back from COCO as a weak 'person'. Below this score a
// body without a face is treated as a thing, so Gemini gets to name it. Not measured yet:
// check the scores with ?debug on the phone.
export const PERSON_MIN_SCORE = 0.75;

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

// Detections: { kind: 'object', label, bbox, score? } from COCO-SSD and { kind: 'person', emotion,
// bbox, track?, grudged? } from faces. bbox is [x, y, width, height], and the tap must be in the
// same video pixels.
export function pickTarget(tap, detections) {
  const hits = detections
    .filter((detection) => contains(detection.bbox, tap))
    .sort((a, b) => area(a.bbox) - area(b.bbox));
  for (const hit of hits) {
    if (!isBody(hit)) return hit;
    const face = detections.find(
      (detection) => detection.kind === 'person' && contains(hit.bbox, center(detection.bbox)),
    );
    if (face) return face;
    // A person without a visible face must stay kind 'person': kind 'object' would send
    // their image to Gemini, and only the emotion name may leave the phone.
    if (isConfident(hit)) return { kind: 'person', emotion: 'neutral', bbox: hit.bbox };
  }
  return null;
}
