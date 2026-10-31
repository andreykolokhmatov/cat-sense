import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { EQUIP_FRAMES, POSE_NAMES, allPoseSrcs, poseSrc } from '../public/js/logic/catPoses.js';

const publicDir = join(import.meta.dirname, '..', 'public');

test('every mood has a plain and a masked picture', () => {
  for (const name of POSE_NAMES) {
    assert.notEqual(poseSrc(name), poseSrc(name, true), name);
    assert.match(poseSrc(name, true), /\/mask-/, name);
  }
});

test('the grudge shows the angry cat', () => {
  assert.equal(poseSrc('grudge'), '/assets/cat/angry.webp');
  assert.equal(poseSrc('grudge', true), '/assets/cat/mask-angry.webp');
});

test('an unknown mood falls back to the curious pose', () => {
  assert.equal(poseSrc('nope'), poseSrc('curious'));
  assert.equal(poseSrc('nope', true), poseSrc('curious', true));
});

test('the mask goes on from the plain curious cat to the masked one in the agreed timing', () => {
  assert.equal(EQUIP_FRAMES[0].src, poseSrc('curious'));
  assert.equal(EQUIP_FRAMES.at(-1).src, poseSrc('curious', true));
  assert.deepEqual(
    EQUIP_FRAMES.slice(1).map((frame) => frame.ms),
    [250, 300, 350, 250, 350],
  );
});

// Linux on Vercel is case-sensitive: a name that only matches on Windows breaks the demo.
// existsSync would pass on Windows whatever the case, so the names are compared as listed.
test('every picture exists under exactly this name', () => {
  const files = new Set(readdirSync(join(publicDir, 'assets', 'cat')));
  for (const src of allPoseSrcs()) assert.ok(files.has(basename(src)), src);
});
