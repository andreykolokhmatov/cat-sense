import { colorSignature, faceGeometry, frameGain } from './logic/appearance.js';
import { videoFrame } from './logic/coverMap.js';
import { bodyDetections, faceDetections } from './logic/detections.js';
import { createGrudges } from './logic/grudges.js';
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
// Colours of hair and clothes need no detail: the look is read from a small copy of the frame.
const SAMPLE_LONG_SIDE = 192;

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
const grudges = createGrudges();
// Face proportions of the last cycle by track id, for the look taken when a grudge starts.
let geometries = new Map();
let sampleCanvas = null;
const grudgeEvents = [];
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

function runFaces(source, frame) {
  const result = faceLandmarker.detectForVideo(source, nextTimestamp());
  return { found: faceDetections(result, frame), landmarks: result.faceLandmarks };
}

function findFaces(source, frame) {
  return runFaces(source, frame).found;
}

// Only while the cat holds a grudge: without one nobody's look is read at all.
function sampleFrame(frame) {
  const scale = SAMPLE_LONG_SIDE / Math.max(frame.width, frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  sampleCanvas ??= document.createElement('canvas');
  if (sampleCanvas.width !== width || sampleCanvas.height !== height) {
    sampleCanvas.width = width;
    sampleCanvas.height = height;
  }
  const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return { pixels, scale, gain: frameGain(pixels) };
}

function colorsOf(sample, bbox) {
  return colorSignature(sample.pixels, bbox.map((value) => value * sample.scale), sample.gain);
}

// A frame that cannot be read costs the colours, not the cycle: the proportions still count.
function trySample(frame) {
  try {
    return sampleFrame(frame);
  } catch (error) {
    console.warn('Could not read the frame for the grudge', error);
    return null;
  }
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

function withTracks(found, landmarks, frame) {
  const ids = faceTracker.update(found.map(({ bbox }) => bbox));
  const gaps = new Map(faceTracker.tracks().map(({ id, gap }) => [id, gap]));
  geometries = new Map(ids.map((id, index) => [id, faceGeometry(landmarks[index], frame)]));
  if (grudges.active()) {
    const sample = trySample(frame);
    const looks = found.map((face, index) => ({
      track: ids[index],
      gap: gaps.get(ids[index]) ?? 0,
      color: sample && colorsOf(sample, face.bbox),
      geometry: geometries.get(ids[index]),
    }));
    for (const event of grudges.update(looks, performance.now())) {
      grudgeEvents.push({ ...event, bbox: found[ids.indexOf(event.track)]?.bbox });
    }
  }
  return found.map((face, index) => ({
    ...face,
    track: ids[index],
    grudged: grudges.isOffender(ids[index]),
    likeness: grudges.active() ? grudges.likeness(ids[index]) : null,
  }));
}

function updateFaces(frame) {
  if (!faceLandmarker) return;
  let found = [];
  let landmarks = [];
  try {
    ({ found, landmarks } = runFaces(video, frame));
  } catch (error) {
    console.warn('Face Landmarker failed on a frame', error);
  }
  faces = withTracks(found, landmarks, frame);
  facesReady.resolve('ready');
}

function notify() {
  for (const listener of listeners) listener();
}

// After a rotation the old boxes are in another frame, after the background the people may
// be gone: either way a grudge must not stick to whoever is there now. The offenders' looks
// stay, so the cat can still recognise them.
function forgetFaces() {
  faceTracker.reset();
  grudges.detach();
  geometries = new Map();
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

// Starts a grudge on a face in view, with its look read from the frame right now. Returns
// whether there was such a face.
export function startGrudge(trackId) {
  const face = faces.find((candidate) => candidate.track === trackId);
  if (!face || !isCurrentFrame()) return false;
  const sample = trySample(detectionsFrame);
  const color = sample && colorsOf(sample, face.bbox);
  grudges.start({ track: trackId, color, geometry: geometries.get(trackId) ?? null }, performance.now());
  faces = faces.map((candidate) => (candidate.track === trackId ? { ...candidate, grudged: true } : candidate));
  return true;
}

// Returns whether there was a grudge on this face to drop.
export function forgiveGrudge(trackId) {
  if (!grudges.forgive(trackId)) return false;
  faces = faces.map((face) => (face.track === trackId ? { ...face, grudged: false } : face));
  return true;
}

// { type: 'back', track, awayMs, bbox } for each offender recognised since the last call.
export function takeGrudgeEvents() {
  return grudgeEvents.splice(0);
}

// Tracks in video pixels of the current frame, empty right after a rotation.
export function faceTracks() {
  return isCurrentFrame() ? faceTracker.tracks().map((track) => ({ ...track, grudged: grudges.isOffender(track.id) })) : [];
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
