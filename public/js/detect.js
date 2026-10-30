import { videoFrame } from './logic/coverMap.js';
import { bodyDetections, faceDetections } from './logic/detections.js';
import { createTracker } from './logic/tracker.js';

const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const LOOP_MS = 250;
// The default is 1, which would leave a second face in the frame without a privacy mask.
const MAX_FACES = 5;
const HAVE_CURRENT_DATA = 2;

let video = null;
let cocoModel = null;
let faceLandmarker = null;
let bodies = [];
let faces = [];
let detectionsFrame = null;
let lastTimestamp = 0;
// Only the loop feeds the tracker: the tap-time search in detectFacesNow runs on a single
// frozen frame and would count as a cycle where everyone else went missing.
const faceTracker = createTracker({ prefix: 'face-' });
const listeners = [];

function pageLoaded() {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
}

async function loadCoco() {
  try {
    await pageLoaded();
    if (!window.tf || !window.cocoSsd) throw new Error('scripts did not load');
    await window.tf.setBackend('webgl');
    await window.tf.ready();
    cocoModel = await window.cocoSsd.load();
  } catch (error) {
    console.warn('COCO-SSD is unavailable', error);
  }
}

async function loadFaceLandmarker() {
  try {
    // Only a dynamic import: a static one would take main.js down when the CDN fails.
    const { FaceLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    const create = (delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: MAX_FACES,
        outputFaceBlendshapes: true,
      });
    faceLandmarker = await create('GPU').catch(() => create('CPU'));
  } catch (error) {
    console.warn('Face Landmarker is unavailable', error);
  }
}

// detectForVideo rejects a timestamp that does not grow, and the loop and the tap share it.
function nextTimestamp() {
  lastTimestamp = Math.max(lastTimestamp + 1, performance.now());
  return lastTimestamp;
}

function findFaces(source, frame) {
  return faceDetections(faceLandmarker.detectForVideo(source, nextTimestamp()), frame);
}

async function updateBodies() {
  if (!cocoModel) return;
  try {
    bodies = bodyDetections(await cocoModel.detect(video));
  } catch (error) {
    bodies = [];
    console.warn('COCO-SSD failed on a frame', error);
  }
}

function withTracks(found) {
  const ids = faceTracker.update(found.map(({ bbox }) => bbox));
  return found.map((face, index) => ({ ...face, track: ids[index], grudged: faceTracker.isGrudged(ids[index]) }));
}

function updateFaces(frame) {
  if (!faceLandmarker) return;
  let found = [];
  try {
    found = findFaces(video, frame);
  } catch (error) {
    console.warn('Face Landmarker failed on a frame', error);
  }
  faces = withTracks(found);
}

function notify() {
  for (const listener of listeners) listener();
}

// After a rotation the old boxes are in another frame, after the background the people may
// be gone: either way a grudge must not stick to whoever is there now.
function forgetFaces() {
  faceTracker.reset();
  faces = faces.map((face) => ({ ...face, track: null, grudged: false }));
}

async function tick() {
  const frame = videoFrame(video);
  if (detectionsFrame && (detectionsFrame.width !== frame.width || detectionsFrame.height !== frame.height)) {
    forgetFaces();
  }
  await updateBodies();
  updateFaces(frame);
  detectionsFrame = frame;
  notify();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  for (;;) {
    const startedAt = performance.now();
    if (!document.hidden && video.readyState >= HAVE_CURRENT_DATA) await tick();
    await pause(Math.max(0, LOOP_MS - (performance.now() - startedAt)));
  }
}

function isCurrentFrame() {
  return detectionsFrame?.width === video.videoWidth && detectionsFrame?.height === video.videoHeight;
}

export function startDetection(videoElement) {
  video = videoElement;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    forgetFaces();
    notify();
  });
  loadCoco();
  loadFaceLandmarker();
  runLoop();
}

// After a rotation the boxes are in the old frame: they would miss the objects and the masks.
export function getDetections() {
  return isCurrentFrame() ? [...bodies, ...faces] : [];
}

export function onDetections(listener) {
  listeners.push(listener);
}

export function markGrudge(trackId) {
  faceTracker.mark(trackId);
  faces = faces.map((face) => (face.track === trackId ? { ...face, grudged: true } : face));
}

// Tracks in video pixels of the current frame, empty right after a rotation.
export function faceTracks() {
  return isCurrentFrame() ? faceTracker.tracks() : [];
}

// Returns null while the model is unavailable, so the caller can refuse to build an image.
export function detectFacesNow(canvas) {
  if (!faceLandmarker) return null;
  return findFaces(canvas, { width: canvas.width, height: canvas.height });
}
