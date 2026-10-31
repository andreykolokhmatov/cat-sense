import { videoFrame } from './logic/coverMap.js';
import { bodyDetections, faceDetections } from './logic/detections.js';
import { cocoEvery, createAverage, nextPause } from './logic/perf.js';
import { createTracker } from './logic/tracker.js';
import { withTimeout } from './logic/withTimeout.js';
import { FACE_MODEL_URL, VISION_URL, pageLoaded } from './preload.js';

const LOOP_MS = 250;
// The default is 1, which would leave a second face in the frame without a privacy mask.
const MAX_FACES = 5;
const HAVE_CURRENT_DATA = 2;
// A preloaded part that never answers must not keep its model from loading: after this the
// model loads by its URL. Longer than the loading screen, so a slow but moving download is
// not fetched twice while the visitor still waits.
const PRELOAD_WAIT_MS = 30000;

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

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// 'ready' after the first real run on a camera frame, when the shaders for its size are built;
// 'failed' when the model did not load. The loading screen waits for either.
const cocoReady = deferred();
const facesReady = deferred();

async function cocoFrom(artifacts) {
  if (artifacts) {
    try {
      return await window.cocoSsd.load({ modelUrl: window.tf.io.fromMemory(artifacts) });
    } catch (error) {
      console.warn('COCO-SSD did not load from the preloaded files', error);
    }
  }
  return window.cocoSsd.load();
}

async function loadCoco(preloaded) {
  try {
    await pageLoaded();
    if (!window.tf || !window.cocoSsd) throw new Error('scripts did not load');
    await window.tf.setBackend('webgl');
    await window.tf.ready();
    cocoModel = await cocoFrom(await preloaded);
  } catch (error) {
    console.warn('COCO-SSD is unavailable', error);
  }
  if (!cocoModel) cocoReady.resolve('failed');
}

async function importVision() {
  // Only a dynamic import: a static one would take main.js down when the CDN fails.
  const { FaceLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
  return { FaceLandmarker, fileset: await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`) };
}

async function loadFaceLandmarker(preloadedVision, preloadedModel) {
  try {
    const { FaceLandmarker, fileset } = (await preloadedVision) ?? (await importVision());
    const buffer = await preloadedModel;
    const create = (model, delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { ...model, delegate },
        runningMode: 'VIDEO',
        numFaces: MAX_FACES,
        outputFaceBlendshapes: true,
      });
    // MediaPipe 0.10.35 keeps the buffer as is, without detaching it, so the CPU retry reuses it.
    const createAny = (model) => create(model, 'GPU').catch(() => create(model, 'CPU'));
    const byUrl = () => createAny({ modelAssetPath: FACE_MODEL_URL });
    faceLandmarker = buffer
      ? await createAny({ modelAssetBuffer: buffer }).catch((error) => {
          console.warn('Face Landmarker did not load from the preloaded file', error);
          return byUrl();
        })
      : await byUrl();
  } catch (error) {
    console.warn('Face Landmarker is unavailable', error);
  }
  if (!faceLandmarker) facesReady.resolve('failed');
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
  facesReady.resolve('ready');
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

// How long a whole tick and the COCO part of it take on this phone, to pace the loop.
const tickCost = createAverage();
const cocoCost = createAverage();
let tickCount = 0;
let cocoWarm = false;

async function tick() {
  const frame = videoFrame(video);
  if (detectionsFrame && (detectionsFrame.width !== frame.width || detectionsFrame.height !== frame.height)) {
    forgetFaces();
    // The old boxes are in another frame; fetch new ones now, not on the next scheduled tick.
    bodies = [];
    tickCount = 0;
  }
  // The heavy model runs on every n-th tick, the face model on every one.
  if (tickCount % cocoEvery(cocoCost.get() ?? 0) === 0 && cocoModel) {
    const startedAt = performance.now();
    await updateBodies();
    // The first run builds the shaders: counted, it would slow the pace for several ticks.
    if (cocoWarm) cocoCost.add(performance.now() - startedAt);
    cocoWarm = true;
    cocoReady.resolve('ready');
  }
  tickCount += 1;
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
    if (!document.hidden && video.readyState >= HAVE_CURRENT_DATA) {
      await tick();
      tickCost.add(performance.now() - startedAt);
    }
    await pause(nextPause(LOOP_MS, performance.now() - startedAt));
  }
}

// For the developer mode.
export function detectStats() {
  return { tickMs: tickCost.get(), cocoMs: cocoCost.get(), cocoEvery: cocoEvery(cocoCost.get() ?? 0) };
}

function isCurrentFrame() {
  return detectionsFrame?.width === video.videoWidth && detectionsFrame?.height === video.videoHeight;
}

// preloaded: { coco, faces, vision } promises from preload.js, each may give null.
// Returns { coco, faces }: promises of 'ready' or 'failed'.
export function startDetection(videoElement, preloaded = {}) {
  video = videoElement;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    forgetFaces();
    notify();
  });
  const bounded = (part) => withTimeout(part, PRELOAD_WAIT_MS, null);
  loadCoco(bounded(preloaded.coco));
  loadFaceLandmarker(bounded(preloaded.vision), bounded(preloaded.faces));
  runLoop();
  return { coco: cocoReady.promise, faces: facesReady.promise };
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

// For the developer mode: which models are loaded.
export function modelStatus() {
  return { coco: Boolean(cocoModel), faces: Boolean(faceLandmarker) };
}

// Returns null while the model is unavailable, so the caller can refuse to build an image.
export function detectFacesNow(canvas) {
  if (!faceLandmarker) return null;
  return findFaces(canvas, { width: canvas.width, height: canvas.height });
}
