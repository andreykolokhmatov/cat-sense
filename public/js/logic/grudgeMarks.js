import { videoToScreen } from './coverMap.js';

const MARK_SHARE = 0.6;
const MARK_MIN_PX = 28;
const MARK_MAX_PX = 80;
// Face Landmarker sometimes skips a frame: a mark that vanished for one cycle would blink.
const MARK_MAX_MISSED = 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// faceTracks are in video pixels of `frame`; marks come out in screen pixels of `view`, with
// x, y the centre of the mark, sitting just above the face and never above the screen.
export function grudgeMarks(faceTracks, view, frame) {
  return faceTracks
    .filter(({ grudged, missed = 0 }) => grudged && missed <= MARK_MAX_MISSED)
    .map(({ bbox }) => videoToScreen(bbox, view, frame))
    .filter(Boolean)
    .map(([x, y, width]) => {
      const size = clamp(width * MARK_SHARE, MARK_MIN_PX, MARK_MAX_PX);
      return { x: x + width / 2, y: Math.max(size / 2, y - size / 2), size };
    });
}
