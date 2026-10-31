import { detectFacesNow, getDetections } from './detect.js';
import { videoFrame } from './logic/coverMap.js';
import { cropRegion } from './logic/cropRegion.js';
import { privacyMasks } from './logic/detections.js';
import { GATE_SIDE, logoStats, mayHoldLogo } from './logic/logoGate.js';

const MASK_COLOR = '#000';
// Small print and the thin eye slits of the logo smear at 0.8; the crop stays far below the limit.
const JPEG_QUALITY = 0.9;

const frameCanvas = document.createElement('canvas');
const cropCanvas = document.createElement('canvas');
const gateCanvas = document.createElement('canvas');

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

function gateStats({ sx, sy, sw, sh }) {
  gateCanvas.width = GATE_SIDE;
  gateCanvas.height = GATE_SIDE;
  const context = gateCanvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, GATE_SIDE, GATE_SIDE);
  return logoStats(context.getImageData(0, 0, GATE_SIDE, GATE_SIDE).data);
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

// A clothes crop for the logo check: { image, gate: { white, dark, pass } }, image null when it must not leave the
// phone, or null when even the gate could not run. The gate reads the frame before the faces
// are painted, since the black paint would pass for black fabric; nothing it reads is sent.
export function torsoSnapshot(video, box) {
  try {
    const frame = videoFrame(video);
    freezeFrame(video, frame);
    const crop = cropRegion(box, frame);
    if (!crop) return null;
    const stats = gateStats(crop);
    const gate = { ...stats, pass: mayHoldLogo(stats) };
    if (!gate.pass) return { image: null, gate };
    const faces = detectFacesNow(frameCanvas);
    if (!faces) return { image: null, gate };
    paintMasks(privacyMasks([...faces, ...getDetections()]));
    return { image: encodeCrop(crop), gate };
  } catch (error) {
    console.warn('Torso snapshot failed', error);
    return null;
  }
}
