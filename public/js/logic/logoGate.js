// A cheap check on the phone before a clothes crop may leave it: the hackathon shirts are black
// with only the white mask printed. A plain shirt of any colour, skin or a busy print stays home.
// Starting values from synthetic pictures, not from the real shirt: tune them with ?debug.

export const GATE_SIDE = 32;
// A pixel is "white" if bright and nearly grey: under warm hall light the print turns yellowish.
export const WHITE_LUMA = 170;
export const WHITE_CHROMA = 60;
export const DARK_LUMA = 70;
// The mask fills a part of the chest, never all of it; a white or light shirt fills it all.
export const WHITE_MIN = 0.03;
export const WHITE_MAX = 0.45;
// Black fabric must surround the print; a white print on a coloured shirt is not the logo.
export const DARK_MIN = 0.3;

// rgba: pixels as from getImageData (4 bytes each). Returns shares of white and dark pixels.
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
    else if (luma >= WHITE_LUMA && Math.max(r, g, b) - Math.min(r, g, b) <= WHITE_CHROMA) white += 1;
  }
  return { white: white / pixels, dark: dark / pixels };
}

export function mayHoldLogo({ white, dark }) {
  return white >= WHITE_MIN && white <= WHITE_MAX && dark >= DARK_MIN;
}
