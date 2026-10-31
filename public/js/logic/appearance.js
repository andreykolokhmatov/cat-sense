// How the cat tells its offender from other people: the colours above and below the face (hair,
// clothes) and the proportions of the face. No model and no names: the look is kept in memory
// only while the cat holds a grudge, and it never leaves the phone.

// Starting values, not measured on people yet: dev mode shows the scores to tune them.
const MIN_PIXELS = 12;
const DARK_VALUE = 0.22;
const GRAY_SATURATION = 0.2;
const STRONG_SATURATION = 0.5;
const TARGET_VALUE = 0.45;
const MIN_GAIN = 0.6;
const MAX_GAIN = 1.8;
const GAIN_STEP = 7;
const HUE_SECTORS = 8;
const FIRST_HUE_BIN = 4;
export const BINS = FIRST_HUE_BIN + HUE_SECTORS * 2;

// In face sizes from the face box: hair above the forehead, clothes on the chest below the neck.
// Skin is left out (the face, and the neck right under the chin): it tells people apart poorly
// and follows the light.
export const REGIONS = Object.freeze({
  hair: { left: 0.1, right: 0.9, top: -0.4, bottom: -0.02 },
  body: { left: -0.15, right: 1.15, top: 1.5, bottom: 2.6 },
});
const WEIGHTS = { hair: 0.4, body: 0.6 };

// Landmark pairs on the rigid part of the face, mirrored left and right. The mouth, eyelids and
// brows move with every expression and are left out; everything is divided by the distance
// between the outer eye corners, so the distance to the camera does not matter.
const EYE_CORNERS = [33, 263];
const SPANS = [
  [[133, 362]], // inner eye corners
  [[129, 358]], // wings of the nose
  [[168, 1]], // bridge to the tip of the nose
  [
    [33, 1],
    [263, 1],
  ], // outer eye corners to the tip of the nose
  [[234, 454]], // cheekbones
];
const MIN_LANDMARKS = 468;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// The camera's auto-exposure brightens a dark room and dims a bright one; scaling by the whole
// frame's brightness keeps a black shirt black across a pan.
export function frameGain({ data }) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4 * GAIN_STEP) {
    sum += Math.max(data[i], data[i + 1], data[i + 2]);
    count += 1;
  }
  if (sum === 0) return 1;
  return clamp(TARGET_VALUE / (sum / count / 255), MIN_GAIN, MAX_GAIN);
}

function hueOf(r, g, b, max, delta) {
  let hue;
  if (max === r) hue = (g - b) / delta;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

// Dark, three greys, and eight hue sectors in two saturations. A hue is shared between the two
// nearest sectors, so a colour on a border does not jump between bins from frame to frame.
function addPixel(histogram, r, g, b, gain) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const value = Math.min(1, (max / 255) * gain);
  if (value < DARK_VALUE) {
    histogram[0] += 1;
    return;
  }
  const saturation = (max - min) / max;
  if (saturation < GRAY_SATURATION) {
    histogram[value < 0.55 ? 1 : value < 0.8 ? 2 : 3] += 1;
    return;
  }
  const position = hueOf(r, g, b, max, max - min) / (360 / HUE_SECTORS) - 0.5;
  const lower = Math.floor(position);
  const share = position - lower;
  const strong = saturation >= STRONG_SATURATION ? 1 : 0;
  const bin = (sector) => FIRST_HUE_BIN + (((sector % HUE_SECTORS) + HUE_SECTORS) % HUE_SECTORS) * 2 + strong;
  histogram[bin(lower)] += 1 - share;
  histogram[bin(lower + 1)] += share;
}

function regionHistogram(pixels, [x, y, width, height], region, gain) {
  const left = Math.max(0, Math.floor(x + region.left * width));
  const right = Math.min(pixels.width, Math.ceil(x + region.right * width));
  const top = Math.max(0, Math.floor(y + region.top * height));
  const bottom = Math.min(pixels.height, Math.ceil(y + region.bottom * height));
  const histogram = new Float32Array(BINS);
  let count = 0;
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const i = (row * pixels.width + column) * 4;
      addPixel(histogram, pixels.data[i], pixels.data[i + 1], pixels.data[i + 2], gain);
      count += 1;
    }
  }
  if (count < MIN_PIXELS) return null;
  for (let bin = 0; bin < BINS; bin += 1) histogram[bin] /= count;
  return histogram;
}

// pixels: { data, width, height } RGBA, like ImageData; box: the face in those pixels.
// Returns { hair, body } histograms, each null when it is out of the frame, or null for both.
export function colorSignature(pixels, box, gain = frameGain(pixels)) {
  const hair = regionHistogram(pixels, box, REGIONS.hair, gain);
  const body = regionHistogram(pixels, box, REGIONS.body, gain);
  return hair || body ? { hair, body } : null;
}

// 0..1, or null when the two have no region in common. `required` names regions both must
// have: hair alone is too common (dark hair is everywhere) to recognise someone by.
export function colorSimilarity(a, b, required = []) {
  if (!a || !b) return null;
  if (required.some((name) => !a[name] || !b[name])) return null;
  let total = 0;
  let weight = 0;
  for (const name of Object.keys(WEIGHTS)) {
    const p = a[name];
    const q = b[name];
    if (!p || !q) continue;
    let common = 0;
    for (let bin = 0; bin < BINS; bin += 1) common += Math.min(p[bin], q[bin]);
    total += WEIGHTS[name] * common;
    weight += WEIGHTS[name];
  }
  return weight > 0 ? total / weight : null;
}

// A running average: `rate` is the share of the new look. A region one side lacks is taken
// from the other.
export function mixColor(a, b, rate) {
  if (!a) return b ?? null;
  if (!b) return a;
  const mixed = {};
  for (const name of Object.keys(WEIGHTS)) {
    const p = a[name];
    const q = b[name];
    mixed[name] = p && q ? p.map((value, bin) => value + (q[bin] - value) * rate) : (p ?? q ?? null);
  }
  return mixed;
}

// landmarks: Face Landmarker's normalized points of one face; frame: the video size in pixels.
export function faceGeometry(landmarks, frame) {
  if (!Array.isArray(landmarks) || landmarks.length < MIN_LANDMARKS) return null;
  // z comes in roughly the units of x, so the 3D distances hold up when the head turns.
  const at = (index) => {
    const { x, y, z = 0 } = landmarks[index];
    return [x * frame.width, y * frame.height, z * frame.width];
  };
  const distance = ([a, b]) => {
    const p = at(a);
    const q = at(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };
  const eyes = distance(EYE_CORNERS);
  if (!(eyes > 0)) return null;
  return SPANS.map((pairs) => pairs.reduce((sum, pair) => sum + distance(pair), 0) / pairs.length / eyes);
}

// The mean relative difference of the proportions: 0 for the same numbers, about 0.1 for
// clearly different faces. null when either side has none.
export function geometryDifference(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]) / ((a[i] + b[i]) / 2 || 1);
  return sum / a.length;
}

export function mixGeometry(a, b, rate) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.map((value, i) => value + (b[i] - value) * rate);
}
