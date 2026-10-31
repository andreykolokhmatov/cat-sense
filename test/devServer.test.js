import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { TYPES, resolvePublicPath } from '../scripts/dev-server.mjs';

const publicDir = resolve('/site/public');
const inside = (...parts) => join(publicDir, ...parts);

test('the root is the start page', () => {
  assert.equal(resolvePublicPath('/', publicDir), inside('index.html'));
});

test('a file path stays inside public', () => {
  assert.equal(resolvePublicPath('/js/main.js', publicDir), inside('js', 'main.js'));
  assert.equal(resolvePublicPath('/assets/cat/curious.webp', publicDir), inside('assets', 'cat', 'curious.webp'));
});

test('climbing out of public is refused, plain or encoded', () => {
  for (const path of ['/../.env', '/../../etc/passwd', '/js/../../.env', '/%2e%2e/.env', '/..%2f.env', '/..\\.env']) {
    assert.equal(resolvePublicPath(path, publicDir), null, path);
  }
});

test('a NUL byte or broken encoding is refused', () => {
  assert.equal(resolvePublicPath('/a%00b', publicDir), null);
  assert.equal(resolvePublicPath('/%E0%A4%A', publicDir), null);
});

test('a path that only starts like public is not inside it', () => {
  assert.equal(resolvePublicPath('/../public-secret/key.txt', publicDir), null);
});

test('every file type of the site has a content type', () => {
  for (const extension of ['.html', '.js', '.json', '.webp', '.png', '.webmanifest']) {
    assert.ok(TYPES[extension], extension);
  }
});
