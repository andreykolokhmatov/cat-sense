// Pacing rules for slow phones. No DOM and no clock of their own, so the tests drive them.

// A tick that takes as long as its period would keep the main thread busy all the time and
// starve drawing and touch: the page would lag even when each frame is "on time". The pause
// is at least the period, and never less than a share of what the tick itself cost.
const IDLE_RATIO = 0.8;
export function nextPause(loopMs, elapsedMs) {
  return Math.max(0, loopMs - elapsedMs, elapsedMs * IDLE_RATIO);
}

// COCO-SSD is the heavy model, and its boxes only matter at a tap (a body behind a faceless
// head, a tap on a body), so on a slow phone it runs on every n-th tick.
export function cocoEvery(cocoMs) {
  if (cocoMs > 180) return 3;
  if (cocoMs > 90) return 2;
  return 1;
}

// A moving average, so one slow frame does not change the pace.
export function createAverage(weight = 0.3) {
  let value = null;
  return {
    add(sample) {
      value = value === null ? sample : value + (sample - value) * weight;
      return value;
    },
    get: () => value,
  };
}

export const QUALITY_NAMES = ['полное', 'лёгкое', 'CSS'];

// Counts animation frames and steps the picture quality down when the page runs slow. Frames
// are counted, not renders: the camera may deliver 15 fps in a dim room while the page itself
// is fine. After a pause (the page was in the background) and after a step down it warms up
// again, so shader compilation and a cold start are not taken for slowness.
export function createGovernor({ windowMs = 2000, warmupMs = 3000, minFps = 24, maxGapMs = 1000, steps = 2 } = {}) {
  let level = 0;
  let fps = null;
  let startedAt = null;
  let windowStart = null;
  let count = 0;
  let last = null;

  return {
    get level() {
      return level;
    },
    get fps() {
      return fps;
    },
    // Call on every animation frame. Returns the new level when it went down, otherwise null.
    frame(now) {
      if (startedAt === null || (last !== null && now - last > maxGapMs)) {
        startedAt = now;
        windowStart = null;
      }
      last = now;
      if (now - startedAt < warmupMs) return null;
      if (windowStart === null) {
        windowStart = now;
        count = 0;
        return null;
      }
      count += 1;
      const elapsed = now - windowStart;
      if (elapsed < windowMs) return null;
      fps = (count * 1000) / elapsed;
      windowStart = now;
      count = 0;
      if (fps >= minFps || level >= steps) return null;
      level += 1;
      startedAt = now;
      windowStart = null;
      return level;
    },
  };
}
