import { createLoading } from './logic/loading.js';
import { downloadState, onDownload } from './preload.js';

// The intro stays up after the camera opens, while the models load and build their shaders:
// that work holds the main thread, and the camera behind it would only show a frozen frame.

// Starting values until the measurement on the iPhone (plan step 7).
const LOADER_MAX_MS = 25000;
const DOWNLOAD_SHARE = 0.6;
// The bar is redrawn on a timer: rAF stops while the main thread is busy, the timer catches up.
const FRAME_MS = 100;
const STAGES = [
  { id: 'coco', label: 'COCO', expectedMs: 6000 },
  { id: 'faces', label: 'лица', expectedMs: 4000 },
];
// A stage's warm-up starts once the files it needs are here.
const STAGE_FILES = { coco: ['coco-model'], faces: ['face-model', 'vision-wasm'] };
const LINES = {
  download: 'Протираю глаза…',
  coco: 'Учусь узнавать людей…',
  faces: 'Учусь читать лица…',
  done: 'Готово, мяу!',
};

const intro = document.getElementById('intro');
const bubble = document.getElementById('intro-bubble');
const bar = document.getElementById('loading-bar');
const fill = document.getElementById('loading-fill');
const mbLine = document.getElementById('loading-mb');

// ready: { coco, faces } promises of 'ready' or 'failed' from startDetection. Resolves with
// { summary } when both answered or the deadline passed.
export function runLoading(ready) {
  const startedAt = performance.now();
  const files = downloadState();
  const loading = createLoading({
    downloads: files,
    stages: STAGES,
    downloadShare: DOWNLOAD_SHARE,
    maxMs: LOADER_MAX_MS,
    startedAt,
  });
  const arrived = new Set(files.filter(({ done }) => done).map(({ id }) => id));
  const startStages = (now) => {
    for (const [stage, ids] of Object.entries(STAGE_FILES)) {
      if (ids.every((id) => arrived.has(id))) loading.start(stage, now);
    }
  };
  startStages(startedAt);

  const stopListening = onDownload((id, { loaded, total, done, failed }) => {
    loading.bytes(id, loaded, total);
    if (!done) return;
    const now = performance.now();
    loading.finish(id, now, failed);
    arrived.add(id);
    startStages(now);
  });
  for (const { id } of STAGES) {
    Promise.resolve(ready[id]).then((result) => loading.finish(id, performance.now(), result !== 'ready'));
  }

  intro.classList.add('is-ready', 'is-loading');

  return new Promise((resolve) => {
    let finished = false;
    let line = null;
    let timer = null;
    let deadline = null;

    function end() {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(deadline);
      stopListening();
      intro.classList.remove('is-loading');
      resolve({ summary: loading.summaryLine(performance.now()) });
    }

    function draw() {
      const now = performance.now();
      const value = loading.progress(now);
      fill.style.transform = `scaleX(${value})`;
      bar.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      const phase = loading.phase();
      mbLine.textContent = phase === 'download' ? loading.mbLine() : '';
      const next = LINES[phase] ?? LINES.done;
      if (next !== line) {
        line = next;
        bubble.textContent = line;
      }
      if (loading.done(now)) end();
    }

    timer = setInterval(draw, FRAME_MS);
    // Its own timer as well: the deadline must not depend on the redraw running.
    deadline = setTimeout(end, LOADER_MAX_MS);
    draw();
  });
}
