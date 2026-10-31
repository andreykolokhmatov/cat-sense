// The models are fetched on the intro, while the visitor reads it: after the tap only the
// warm-up is left. Every part resolves to null on any error, never rejects, and detect.js then
// loads that model by its URL as before; the files fetched here also sit in the HTTP cache.

export const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
export const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// The model cocoSsd.load() picks by default (lite_mobilenet_v2).
export const COCO_MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';

// Sizes on the wire, measured 31.10: the bar needs them before the servers answer. The COCO
// model is six files and the wasm comes compressed, so the server's own length is no use there.
export const DOWNLOADS = [
  { id: 'coco-model', expectedBytes: 18_561_843 },
  { id: 'face-model', expectedBytes: 3_758_596 },
  { id: 'vision-wasm', expectedBytes: 2_987_039 },
];
// A download that stops without an error would keep its model from loading at all; aborted,
// it falls back to the old path, which makes a fresh request.
const STALL_MS = 15000;

const state = new Map(DOWNLOADS.map(({ id }) => [id, { loaded: 0, total: null, done: false, failed: false }]));
const listeners = new Set();
const NOTHING = { coco: null, faces: null, vision: null };
let results = null;

export function pageLoaded() {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
}

function update(id, change) {
  const entry = state.get(id);
  Object.assign(entry, change);
  for (const listener of listeners) listener(id, { ...entry });
}

export function downloadState() {
  return DOWNLOADS.map((download) => ({ ...download, ...state.get(download.id) }));
}

// listener(id, { loaded, total, done, failed }); returns the unsubscribe function.
export function onDownload(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function contentLength(response) {
  if (response.headers.get('content-encoding')) return null;
  const length = Number(response.headers.get('content-length'));
  return length > 0 ? length : null;
}

// A fetch that reports every chunk and gives back a complete Response, as tfjs expects.
async function countedFetch(url, { onBytes = () => {}, onTotal = () => {} } = {}, init = {}) {
  const controller = new AbortController();
  let timer;
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), STALL_MS);
  };
  watch();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok || !response.body) return response;
    const total = contentLength(response);
    if (total) onTotal(total);
    const reader = response.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      watch();
      chunks.push(value);
      onBytes(value.byteLength);
    }
    return new Response(new Blob(chunks), { status: response.status, statusText: response.statusText });
  } finally {
    clearTimeout(timer);
  }
}

async function preloadCoco() {
  const id = 'coco-model';
  try {
    if (!window.tf?.io?.http) throw new Error('TensorFlow.js did not load');
    let loaded = 0;
    const onBytes = (count) => update(id, { loaded: (loaded += count) });
    // tf.io.http fetches model.json and its weight shards; load() gives the artifacts that
    // tf.io.fromMemory takes back in detect.js.
    const fetchFunc = (url, init) => countedFetch(url, { onBytes }, init);
    const artifacts = await window.tf.io.http(COCO_MODEL_URL, { fetchFunc }).load();
    update(id, { done: true });
    return artifacts;
  } catch (error) {
    console.warn('Preloading COCO-SSD failed', error);
    update(id, { done: true, failed: true });
    return null;
  }
}

async function preloadFace() {
  const id = 'face-model';
  try {
    let loaded = 0;
    const response = await countedFetch(FACE_MODEL_URL, {
      onBytes: (count) => update(id, { loaded: (loaded += count) }),
      onTotal: (total) => update(id, { total }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    update(id, { done: true });
    return buffer;
  } catch (error) {
    console.warn('Preloading the face model failed', error);
    update(id, { done: true, failed: true });
    return null;
  }
}

async function readAll(url) {
  const response = await countedFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  await response.arrayBuffer();
}

// MediaPipe fetches its wasm by itself, with the same CORS request as here, so a complete
// read puts it into the HTTP cache. Its bytes come decompressed, so it counts only at the end.
async function preloadVision() {
  const id = 'vision-wasm';
  try {
    const { FaceLandmarker, FilesetResolver } = await import(`${VISION_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
    await Promise.all([readAll(fileset.wasmBinaryPath), readAll(fileset.wasmLoaderPath)]);
    update(id, { done: true });
    return { FaceLandmarker, fileset };
  } catch (error) {
    console.warn('Preloading MediaPipe failed', error);
    update(id, { done: true, failed: true });
    return null;
  }
}

// Starts once, after the page has loaded: the deferred tfjs script is needed, and the intro
// picture must not compete with 25 MB of models.
export function startPreload() {
  if (results) return;
  const loaded = pageLoaded();
  results = {
    coco: loaded.then(preloadCoco),
    faces: loaded.then(preloadFace),
    vision: loaded.then(preloadVision),
  };
}

// Hands the downloads over once and forgets them, so the buffers can be freed after the models
// load. Without startPreload every part is null, and a later startPreload does nothing.
export function takePreloaded() {
  const handed = results ?? NOTHING;
  results = NOTHING;
  return handed;
}
