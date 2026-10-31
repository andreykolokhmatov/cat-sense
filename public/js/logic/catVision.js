// 3x3 colour matrices act on [r, g, b] rows, values in 0..1 or 0..255 alike.

// Machado, Oliveira, Fernandes 2009, deuteranopia at severity 1. The paper's matrix is for
// linear RGB; applying it to sRGB is an approximation that is close enough for a cat.
export const DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];

const LUMA = [0.2126, 0.7152, 0.0722];

export function saturationMatrix(s) {
  return [0, 1, 2].map((row) => LUMA.map((weight, col) => (1 - s) * weight + (row === col ? s : 0)));
}

export function multiply(a, b) {
  return a.map((row) => [0, 1, 2].map((col) => row.reduce((sum, value, k) => sum + value * b[k][col], 0)));
}

export function scale(m, k) {
  return m.map((row) => row.map((value) => value * k));
}

// Cat vision as drawn in the popular "people / cats" comparison: red and green fall into one
// pale tone, almost grey, with only a bluish hint left, and the whole picture is lighter and
// hazier. The matrix does the colours: deuteranopia first, then most of the saturation out and
// a little more light.
export const CAT_SATURATION = 0.4;
export const CAT_BRIGHTNESS = 1.08;
export const CAT_MATRIX = scale(multiply(saturationMatrix(CAT_SATURATION), DEUTERANOPIA), CAT_BRIGHTNESS);
// A light correction on top: contrast a little flatter around a light middle and a thin pale
// fog, so the picture reads brighter and softer. Blur and this are the whole effect.
export const CAT_LOOK = { contrast: 0.88, fogColor: [0.82, 0.87, 1.0], fogAmount: 0.12 };
// Cats see several times less detail than people. Blur step in CSS pixels on screen.
export const CAT_BLUR_PX = 3;

// Edits RGBA pixels in place. Uint8ClampedArray clamps every write to 0..255; alpha is kept.
export function applyMatrix(rgba, m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  for (let p = 0; p < rgba.length; p += 4) {
    const r = rgba[p];
    const gr = rgba[p + 1];
    const bl = rgba[p + 2];
    rgba[p] = a * r + b * gr + c * bl;
    rgba[p + 1] = d * r + e * gr + f * bl;
    rgba[p + 2] = g * r + h * gr + i * bl;
  }
  return rgba;
}
