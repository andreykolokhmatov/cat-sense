import { detectFacesNow, getDetections } from './detect.js';
import { videoFrame } from './logic/coverMap.js';
import { cropRegion } from './logic/cropRegion.js';
import { privacyMasks } from './logic/detections.js';

const MASK_COLOR = '#000';
const JPEG_QUALITY = 0.8;

const frameCanvas = document.createElement('canvas');
const cropCanvas = document.createElement('canvas');

function freezeFrame(video, frame) {
  frameCanvas.width = frame.width;
  frameCanvas.height = frame.height;
  frameCanvas.getContext('2d').drawImage(video, 0, 0);
}

// An opaque fill, not a blur: a blur can be reversed and the face would reach Gemini.
function paintMasks(masks) {
  const context = frameCanvas.getContext('2d');
  context.globalAlpha = 1;
  context.fillStyle = MASK_COLOR;
  for (const mask of masks) context.fillRect(...mask);
}

function encodeCrop({ sx, sy, sw, sh, dw, dh }) {
  cropCanvas.width = dw;
  cropCanvas.height = dh;
  cropCanvas.getContext('2d').drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, dw, dh);
  return cropCanvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
}

// Returns JPEG base64 of the target with every known face painted over, or null. The order
// is the privacy guarantee: faces are searched on the same frozen frame that gets cropped.
export function snapshot(video, target) {
  try {
    const frame = videoFrame(video);
    freezeFrame(video, frame);
    const faces = detectFacesNow(frameCanvas);
    if (!faces) return null;
    paintMasks(privacyMasks([...faces, ...getDetections()]));
    const crop = cropRegion(target.bbox, frame);
    return crop ? encodeCrop(crop) : null;
  } catch (error) {
    console.warn('Snapshot failed', error);
    return null;
  }
}
