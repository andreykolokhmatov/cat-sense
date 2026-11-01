// A cheap check on the phone before a clothes crop may leave it: the hackathon shirts are black
// with only the mask printed, white or pale blue. A plain shirt of any colour, skin or a busy
// print stays home.
// Starting values from synthetic pictures, not from the real shirt: tune them with ?debug.

export const GATE_SIDE = 32;
// A pixel is "white" if bright and nearly grey: under warm hall light the print turns yellowish.
export const WHITE_LUMA = 170;
export const WHITE_CHROMA = 60;
export const DARK_LUMA = 70;
// The real print is pale blue, not white: blue is the top channel, red the lowest, so it fails
// the grey test. A looser chroma lets it in; the luma bar is lower because blue adds little luma.
// Saturated blue stays out by chroma, a light blue shirt by WHITE_MAX.
export const BLUE_LUMA = 140;
export const BLUE_CHROMA = 120;
// Cyan-leaning prints have green a bit above blue.
export const BLUE_GREEN_SLACK = 20;
// The mask fills a part of the chest, never all of it; a white or light shirt fills it all.
export const WHITE_MIN = 0.03;
export const WHITE_MAX = 0.45;
// Black fabric must surround the print; a white print on a coloured shirt is not the logo.
export const DARK_MIN = 0.3;

function isPrint(r, g, b, luma) {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (luma >= WHITE_LUMA && chroma <= WHITE_CHROMA) return true;
  const bluish = r <= g && r <= b && b + BLUE_GREEN_SLACK >= g;
  return bluish && luma >= BLUE_LUMA && chroma <= BLUE_CHROMA;
}

// rgba: pixels as from getImageData (4 bytes each). Returns shares of print (white or pale blue)
// and dark pixels; the field keeps the name white so the dev log and callers stay as they are.
export function logoStats(rgba) {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return { white: 0, dark: 0 };
  let white = 0;
  let dark = 0;
  for (let index = 0; index < pixels * 4; index += 4) {
    const r = rgba[index];
    const g = rgba[index + 1];
    const b = rgba[index + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma <= DARK_LUMA) dark += 1;
    else if (isPrint(r, g, b, luma)) white += 1;
  }
  return { white: white / pixels, dark: dark / pixels };
}

export function mayHoldLogo({ white, dark }) {
  return white >= WHITE_MIN && white <= WHITE_MAX && dark >= DARK_MIN;
}
