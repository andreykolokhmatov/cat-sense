import { detectEmotion } from './detectEmotion.js';

// Starting values, not measured: tune them on real faces on the phone.
const FACE_MARGIN = 0.3;
const HEAD_SHARE = 0.35;

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

function containsCenterOf([x, y, width, height], [faceX, faceY, faceWidth, faceHeight]) {
  const centerX = faceX + faceWidth / 2;
  const centerY = faceY + faceHeight / 2;
  return centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height;
}

function expandFace([x, y, width, height]) {
  return [
    x - width * FACE_MARGIN,
    y - height * FACE_MARGIN,
    width * (1 + 2 * FACE_MARGIN),
    height * (1 + 2 * FACE_MARGIN),
  ];
}

function headOf([x, y, width, height]) {
  return [x, y, width, height * HEAD_SHARE];
}

// COCO-SSD mislabels things, so Gemini names every object. COCO stays only to find bodies:
// they mask heads Face Landmarker missed and keep a tap on a body from sending its image.
export function bodyDetections(cocoResults) {
  return cocoResults
    .filter(({ class: label }) => label === 'person')
    .map(({ bbox, score }) => ({ kind: 'object', label: 'person', bbox, score }));
}

// Landmarks are normalized and can fall outside 0..1 when a face is cut by the frame edge.
export function faceBox(landmarks, frame) {
  const xs = landmarks.map(({ x }) => clampUnit(x) * frame.width);
  const ys = landmarks.map(({ y }) => clampUnit(y) * frame.height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return [left, top, Math.max(...xs) - left, Math.max(...ys) - top];
}

// The 36 landmarks of the MediaPipe face mesh that run around the face, in drawing order.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
  150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// The face contour as [x, y] points in frame pixels, or null when the mesh is incomplete: a
// polygon with gaps would draw a wrong shape, and the caller can fall back to the box.
export function faceOutline(landmarks, frame) {
  const points = FACE_OVAL.map((index) => landmarks[index]).filter(Boolean);
  if (points.length !== FACE_OVAL.length) return null;
  return points.map(({ x, y }) => [clampUnit(x) * frame.width, clampUnit(y) * frame.height]);
}

export function faceDetections({ faceLandmarks, faceBlendshapes }, frame) {
  return faceLandmarks.map((landmarks, index) => ({
    kind: 'person',
    // Missing blendshapes only cost the emotion: the face must still get its privacy mask.
    emotion: detectEmotion(faceBlendshapes?.[index]?.categories),
    bbox: faceBox(landmarks, frame),
    outline: faceOutline(landmarks, frame),
  }));
}

export function privacyMasks(detections) {
  const faces = detections.filter(({ kind }) => kind === 'person').map(({ bbox }) => bbox);
  const faceless = detections
    .filter(({ kind, label }) => kind === 'object' && label === 'person')
    .map(({ bbox }) => bbox)
    .filter((body) => !faces.some((face) => containsCenterOf(body, face)));
  return [...faces.map(expandFace), ...faceless.map(headOf)];
}
