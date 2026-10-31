// Cuts a piece out of an MP3 at frame boundaries, without re-encoding: there is no audio tool
// in the project, and a frame cut keeps the original quality. Usage:
//   node scripts/trim-mp3.mjs input.mp3 output.mp3 startSeconds endSeconds
// Volume and pitch are not touched here: they are set per sound in public/js/logic/sounds.js.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
// A frame decodes with data borrowed from the frames before it (the bit reservoir), so a cut
// keeps a couple of them in front; they sit in the quiet before the sound anyway.
const LEAD_FRAMES = 2;

// Layer III frame header at `offset`, or null.
export function parseHeader(bytes, offset) {
  if (offset + 4 > bytes.length) return null;
  const [b0, b1, b2] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3; // 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
  const layer = (b1 >> 1) & 3; // 1: Layer III
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const mpeg1 = version === 3;
  const bitrate = BITRATES[mpeg1 ? 1 : 2][bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const padding = (b2 >> 1) & 1;
  const length = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
  return { length, samples: mpeg1 ? 1152 : 576, sampleRate };
}

function id3Size(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

// The VBR header frame ("Xing" / "Info") carries the frame count of the whole file: kept in a
// cut, it would tell the decoder the piece is as long as the original.
function isInfoFrame(bytes, offset, length) {
  const text = Buffer.from(bytes.subarray(offset, offset + Math.min(length, 64))).toString('latin1');
  return text.includes('Xing') || text.includes('Info');
}

// Every audio frame with its start time. A header counts only if the next frame (or the end of
// the file) follows right after it: a stray 0xFF byte in tag data must not pass for a frame.
export function listFrames(bytes) {
  const frames = [];
  let offset = id3Size(bytes);
  let time = 0;
  while (offset < bytes.length) {
    const header = parseHeader(bytes, offset);
    const next = header && offset + header.length;
    if (header && (next === bytes.length || parseHeader(bytes, next) || next + 128 === bytes.length)) {
      if (!(frames.length === 0 && isInfoFrame(bytes, offset, header.length))) {
        frames.push({ offset, length: header.length, time });
        time += header.samples / header.sampleRate;
      }
      offset = next;
    } else {
      offset += 1;
    }
  }
  return frames;
}

// The frames that cover startSec..endSec, plus LEAD_FRAMES before, as one MP3 without tags.
export function trimMp3(bytes, startSec, endSec) {
  const frames = listFrames(bytes);
  const first = Math.max(0, frames.findIndex((frame) => frame.time + 1e-9 >= startSec) - LEAD_FRAMES);
  const kept = frames.slice(first).filter((frame) => frame.time < endSec);
  return Buffer.concat(kept.map((frame) => bytes.subarray(frame.offset, frame.offset + frame.length)));
}

async function main([input, output, start, end]) {
  if (!input || !output || start === undefined || end === undefined) {
    console.error('Usage: node scripts/trim-mp3.mjs input.mp3 output.mp3 startSeconds endSeconds');
    process.exitCode = 1;
    return;
  }
  const bytes = await readFile(input);
  const piece = trimMp3(bytes, Number(start), Number(end));
  await writeFile(output, piece);
  console.log(`${output}: ${(piece.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main(process.argv.slice(2));
