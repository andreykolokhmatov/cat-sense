import { videoFrame } from './logic/coverMap.js';
import { faceDetections, objectDetections } from './logic/detections.js';

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
let objects = [];
let faces = [];
let detectionsFrame = null;
let lastTimestamp = 0;

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

async function updateObjects() {
  if (!cocoModel) return;
  try {
    objects = objectDetections(await cocoModel.detect(video));
  } catch (error) {
    objects = [];
    console.warn('COCO-SSD failed on a frame', error);
  }
}

function updateFaces(frame) {
  if (!faceLandmarker) return;
  try {
    faces = findFaces(video, frame);
  } catch (error) {
    faces = [];
    console.warn('Face Landmarker failed on a frame', error);
  }
}

async function tick(onUpdate) {
  const frame = videoFrame(video);
  await updateObjects();
  updateFaces(frame);
  detectionsFrame = frame;
  onUpdate();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop(onUpdate) {
  for (;;) {
    const startedAt = performance.now();
    if (!document.hidden && video.readyState >= HAVE_CURRENT_DATA) await tick(onUpdate);
    await pause(Math.max(0, LOOP_MS - (performance.now() - startedAt)));
  }
}

function isCurrentFrame() {
  return detectionsFrame?.width === video.videoWidth && detectionsFrame?.height === video.videoHeight;
}

export function startDetection(videoElement, onUpdate) {
  video = videoElement;
  loadCoco();
  loadFaceLandmarker();
  runLoop(onUpdate);
}

// After a rotation the boxes are in the old frame: they would miss the objects and the masks.
export function getDetections() {
  return isCurrentFrame() ? [...objects, ...faces] : [];
}

// Returns null while the model is unavailable, so the caller can refuse to build an image.
export function detectFacesNow(canvas) {
  if (!faceLandmarker) return null;
  return findFaces(canvas, { width: canvas.width, height: canvas.height });
}
