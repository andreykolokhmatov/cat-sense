import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SOUNDS, dbToGain, pickSound, playedSeconds, soundNames, soundPath } from '../public/js/logic/sounds.js';

const MOODS = ['want', 'curious', 'scared', 'happy'];

test('every mood the model can send has a sound, and so do the greeting and the grudge', () => {
  for (const mood of [...MOODS, 'greet', 'grudge']) assert.ok(SOUNDS[mood]?.length > 0, mood);
});

test('every clip file exists in public/', () => {
  for (const name of soundNames()) {
    assert.ok(existsSync(join('public', soundPath(name))), name);
  }
});

test('every clip has a sane window, rate and gain', () => {
  for (const sound of Object.values(SOUNDS).flat()) {
    assert.ok(sound.start >= 0 && sound.end > sound.start, sound.src);
    assert.ok(sound.rate >= 0.8 && sound.rate <= 1.25, `${sound.src} rate ${sound.rate}`);
    assert.ok(Math.abs(sound.gainDb) <= 12, `${sound.src} gain ${sound.gainDb}`);
    assert.ok(playedSeconds(sound) < 1.5, `${sound.src} plays ${playedSeconds(sound)} s`);
  }
});

test('the same clip is not picked twice in a row when the mood has two', () => {
  const [first] = SOUNDS.want;
  for (const random of [0, 0.5, 0.99]) assert.notEqual(pickSound('want', first, () => random), first);
});

test('a mood with one clip always gets it', () => {
  assert.equal(pickSound('greet', SOUNDS.greet[0], () => 0.7), SOUNDS.greet[0]);
});

test('thinking is silent and an unknown mood gets the curious meow', () => {
  assert.equal(pickSound('think'), null);
  assert.equal(pickSound('sleepy', null, () => 0), SOUNDS.curious[0]);
});

test('dbToGain: 0 dB keeps the level, -6 dB halves it', () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(Math.abs(dbToGain(-6) - 0.501) < 0.001);
});
