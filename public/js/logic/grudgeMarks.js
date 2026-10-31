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
// x, y the centre of the mark, sitting just above the face and never above the screen, and
// `face` the top-left box of the face itself and `outline` its contour in screen points (null
// when the mesh was incomplete), for the red tint.
export function grudgeMarks(faceTracks, view, frame) {
  return faceTracks
    .filter(({ grudged, missed = 0 }) => grudged && missed <= MARK_MAX_MISSED)
    .map(({ bbox, outline }) => ({ box: videoToScreen(bbox, view, frame), outline }))
    .filter(({ box }) => box)
    .map(({ box: [x, y, width, height], outline }) => {
      const size = clamp(width * MARK_SHARE, MARK_MIN_PX, MARK_MAX_PX);
      return {
        x: x + width / 2,
        y: Math.max(size / 2, y - size / 2),
        size,
        face: { x, y, width, height },
        outline: outline ? outline.map((point) => videoToScreen([point[0], point[1], 0, 0], view, frame).slice(0, 2)) : null,
      };
    });
}
