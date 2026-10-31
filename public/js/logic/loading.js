import { formatSeconds } from './devLog.js';

// Progress of the loading screen after the camera opens. No DOM and no clock: the caller
// passes `now`, so the tests drive it. Downloads are weighed by their size, stages by weight;
// a stage in work creeps towards its share but never reaches it before it really finishes.
// Download and stage ids share one namespace and must differ.

// A stage that takes longer than expected must still leave room for the jump at its finish.
const CREEP_CAP = 0.9;
const MB = 1e6;

function mb(bytes) {
  return (bytes / MB).toFixed(1);
}

export function createLoading({ downloads = [], stages = [], downloadShare = 0.6, maxMs, startedAt = 0 }) {
  const files = new Map(
    downloads.map(({ id, expectedBytes, loaded = 0, total = null, done = false, failed = false }) => [
      id,
      { expectedBytes, loaded, total, done, failed },
    ]),
  );
  const steps = new Map(
    stages.map(({ id, label = id, expectedMs, weight = 1 }) => [
      id,
      { label, expectedMs, weight, startedAt: null, finishedAt: null, failed: false },
    ]),
  );
  let shown = 0;

  const size = (file) => (file.total > 0 ? file.total : file.expectedBytes);
  // A server may send more than it announced, or the guess may be low: never past the size.
  const counted = (file) => (file.done && !file.failed ? size(file) : Math.min(file.loaded, size(file)));
  const sum = (pick) => [...files.values()].reduce((total, file) => total + pick(file), 0);
  const loadedBytes = () => sum(counted);
  const totalBytes = () => sum(size);
  const beforeStart = loadedBytes();

  function downloadFraction() {
    const total = totalBytes();
    if (total <= 0) return 1;
    return sum((file) => (file.done ? size(file) : Math.min(file.loaded, size(file)))) / total;
  }

  function stageShare(step, now) {
    if (step.finishedAt !== null) return step.weight;
    if (step.startedAt === null) return 0;
    if (!(step.expectedMs > 0)) return step.weight * CREEP_CAP;
    const elapsed = Math.max(0, now - step.startedAt);
    return step.weight * CREEP_CAP * (1 - Math.exp(-elapsed / step.expectedMs));
  }

  function stageFraction(now) {
    let weight = 0;
    let share = 0;
    for (const step of steps.values()) {
      weight += step.weight;
      share += stageShare(step, now);
    }
    return weight > 0 ? share / weight : 1;
  }

  const allStagesDone = () => [...steps.values()].every((step) => step.finishedAt !== null);
  const waiting = () => [...steps].filter(([, step]) => step.finishedAt === null);

  function done(now) {
    return allStagesDone() || now - startedAt >= maxMs;
  }

  function stagePart(step) {
    if (step.finishedAt === null) return `${step.label} —`;
    const readyAt = formatSeconds(Math.max(0, step.finishedAt - startedAt));
    // A stage that waited for its download shows how long the warm-up alone took.
    const warm = step.startedAt > startedAt ? ` (прогрев ${formatSeconds(step.finishedAt - step.startedAt)})` : '';
    return `${step.label} ${readyAt}${warm}${step.failed ? ' сбой' : ''}`;
  }

  return {
    bytes(id, loaded, total) {
      const file = files.get(id);
      if (!file) return;
      if (loaded > file.loaded) file.loaded = loaded;
      if (total > 0) file.total = total;
    },
    start(id, now) {
      const step = steps.get(id);
      if (step && step.startedAt === null) step.startedAt = now;
    },
    // A failure counts as done: the screen waits for an answer, not for a success.
    finish(id, now, failed = false) {
      const file = files.get(id);
      if (file && !file.done) Object.assign(file, { done: true, failed });
      const step = steps.get(id);
      if (step && step.finishedAt === null) {
        // Never started explicitly: it ran from the beginning of the loading.
        step.startedAt ??= Math.min(now, startedAt);
        Object.assign(step, { finishedAt: now, failed });
      }
    },
    progress(now) {
      if (allStagesDone()) shown = 1;
      else {
        const raw = downloadShare * downloadFraction() + (1 - downloadShare) * stageFraction(now);
        shown = Math.max(shown, Math.min(raw, 1));
      }
      return shown;
    },
    done,
    waitingFor() {
      return waiting().map(([id]) => id);
    },
    // 'download' while any file is still coming, then the first stage not finished, then null.
    phase() {
      if ([...files.values()].some((file) => !file.done)) return 'download';
      return waiting()[0]?.[0] ?? null;
    },
    mbLine() {
      return `${mb(loadedBytes())} из ${mb(totalBytes())} МБ`;
    },
    summaryLine(now) {
      const parts = [...steps.values()].map(stagePart);
      const late = waiting().map(([, step]) => step.label);
      return [
        `Загрузка ${formatSeconds(Math.max(0, now - startedAt))}`,
        `скачано ${mb(loadedBytes())} МБ (до тапа ${mb(beforeStart)})`,
        ...parts,
        `не дождались: ${late.length ? late.join(', ') : '—'}`,
      ].join(' · ');
    },
  };
}
