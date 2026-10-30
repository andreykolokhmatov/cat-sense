function contains([x, y, width, height], point) {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function area([, , width, height]) {
  return width * height;
}

function center([x, y, width, height]) {
  return { x: x + width / 2, y: y + height / 2 };
}

// Detections: { kind: 'object', label, bbox } from COCO-SSD and { kind: 'person', emotion, bbox }
// from faces. bbox is [x, y, width, height], and the tap must be in the same video pixels.
export function pickTarget(tap, detections) {
  const hit = detections
    .filter((detection) => contains(detection.bbox, tap))
    .sort((a, b) => area(a.bbox) - area(b.bbox))[0];
  if (!hit) return null;
  if (hit.kind !== 'object' || hit.label !== 'person') return hit;

  const face = detections.find(
    (detection) => detection.kind === 'person' && contains(hit.bbox, center(detection.bbox)),
  );
  // A person without a visible face must stay kind 'person': kind 'object' would send
  // their image to Gemini, and only the emotion name may leave the phone.
  return face ?? { kind: 'person', emotion: 'neutral', bbox: hit.bbox };
}
