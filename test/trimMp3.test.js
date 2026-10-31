import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listFrames, parseHeader, trimMp3 } from '../scripts/trim-mp3.mjs';

// MPEG-1 Layer III, 128 kbps, 48 kHz, no padding: 144 * 128000 / 48000 = 384 bytes, 24 ms.
const HEADER = [0xff, 0xfb, 0x94, 0x00];
const FRAME_BYTES = 384;
const FRAME_SEC = 1152 / 48000;

function frame(fill = 0, text = '') {
  const bytes = Buffer.alloc(FRAME_BYTES, fill);
  Buffer.from(HEADER).copy(bytes, 0);
  if (text) Buffer.from(text, 'latin1').copy(bytes, 36);
  return bytes;
}

function id3(size) {
  // Syncsafe size of 200 bytes of tag data.
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 1, 0x48]), Buffer.alloc(size, 0xff)]);
}

test('parseHeader reads the frame size of 128 kbps at 48 kHz', () => {
  assert.deepEqual(parseHeader(Buffer.from(HEADER), 0), { length: 384, samples: 1152, sampleRate: 48000 });
});

test('parseHeader refuses what is not a Layer III frame', () => {
  assert.equal(parseHeader(Buffer.from([0x00, 0xfb, 0x94, 0x00]), 0), null);
  assert.equal(parseHeader(Buffer.from([0xff, 0xfd, 0x94, 0x00]), 0), null, 'Layer II');
  assert.equal(parseHeader(Buffer.from([0xff, 0xfb, 0xf4, 0x00]), 0), null, 'bad bitrate');
  assert.equal(parseHeader(Buffer.from([0xff, 0xfb]), 0), null, 'too short');
});

test('listFrames skips the ID3 tag, even one full of 0xFF bytes, and times every frame', () => {
  const file = Buffer.concat([id3(200), frame(1), frame(2), frame(3)]);
  const frames = listFrames(file);
  assert.equal(frames.length, 3);
  assert.equal(frames[0].offset, 210);
  assert.ok(Math.abs(frames[2].time - 2 * FRAME_SEC) < 1e-9);
});

test('listFrames drops the Xing/Info frame at the start', () => {
  const file = Buffer.concat([frame(0, 'Info'), frame(1), frame(2)]);
  const frames = listFrames(file);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].offset, FRAME_BYTES);
});

test('trimMp3 keeps the frames of the range plus two in front, without the tag', () => {
  const frames = Array.from({ length: 50 }, (_, index) => frame(index + 1));
  const file = Buffer.concat([id3(200), ...frames]);
  const piece = trimMp3(file, 10 * FRAME_SEC, 20 * FRAME_SEC);
  assert.equal(piece.length, 12 * FRAME_BYTES, 'frames 8..19');
  assert.equal(piece[0], 0xff);
  assert.equal(piece[4], 9, 'starts with frame 8, filled with 9');
  assert.equal(piece[piece.length - 1], 20, 'ends with frame 19');
});

test('trimMp3 from the very start does not run below the first frame', () => {
  const file = Buffer.concat(Array.from({ length: 10 }, (_, index) => frame(index + 1)));
  assert.equal(trimMp3(file, 0, 3 * FRAME_SEC).length, 3 * FRAME_BYTES);
});
