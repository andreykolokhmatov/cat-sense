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

// Deuteranopia first, then less saturation and a little more light.
export const CAT_MATRIX = scale(multiply(saturationMatrix(0.7), DEUTERANOPIA), 1.05);
// Cats see several times less detail than people. Blur step in CSS pixels on screen.
export const CAT_BLUR_PX = 2;
// Darkening at the frame edges, 0..1: a hint that the cat looks at the centre.
export const CAT_VIGNETTE = 0.35;

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
