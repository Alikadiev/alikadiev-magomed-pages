import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const verifier = fileURLToPath(new URL('./verify-pages-output.mjs', import.meta.url));
function fixture(run) {
  const parent = mkdtempSync(path.join(tmpdir(), 'artist-site-check-'));
  const root = path.join(parent, 'site');
  mkdirSync(root);
  try { run(root, parent); }
  finally {
    if (path.dirname(parent) !== path.resolve(tmpdir()) || !path.basename(parent).startsWith('artist-site-check-')) throw new Error('Unsafe fixture cleanup');
    rmSync(parent, { recursive: true, force: true });
  }
}
function manifest(root, entries) {
  writeFileSync(path.join(root, 'site-files.json'), JSON.stringify({ version: 1, files: entries.map(([name, content]) => ({ path: name, sha256: createHash('sha256').update(content).digest('hex') })) }));
}
const verify = root => spawnSync(process.execPath, [verifier, root], { encoding: 'utf8' });

test('keeps current pages and assets and removes obsolete release files', () => fixture(root => {
  mkdirSync(path.join(root, 'assets'));
  mkdirSync(path.join(root, 'old-release'));
  writeFileSync(path.join(root, 'index.html'), 'current page');
  writeFileSync(path.join(root, 'assets', 'photo.jpg'), 'original photo bytes');
  writeFileSync(path.join(root, 'old-release', 'old.js'), 'unused');
  manifest(root, [['index.html', 'current page'], ['assets/photo.jpg', 'original photo bytes']]);
  const result = verify(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(root, 'assets', 'photo.jpg'), 'utf8'), 'original photo bytes');
  assert(!existsSync(path.join(root, 'old-release')));
  assert.equal(JSON.parse(result.stdout).removed, 1);
}));

test('does not remove anything when a declared file was changed', () => fixture(root => {
  writeFileSync(path.join(root, 'index.html'), 'corrupt');
  writeFileSync(path.join(root, 'old.js'), 'keep on failure');
  manifest(root, [['index.html', 'expected']]);
  assert.notEqual(verify(root).status, 0);
  assert(existsSync(path.join(root, 'old.js')));
}));

test('does not remove anything when an asset is missing', () => fixture(root => {
  writeFileSync(path.join(root, 'old.js'), 'keep on failure');
  manifest(root, [['missing.jpg', 'expected']]);
  assert.notEqual(verify(root).status, 0);
  assert(existsSync(path.join(root, 'old.js')));
}));

test('rejects paths outside the generated site', () => fixture((root, parent) => {
  writeFileSync(path.join(parent, 'outside.txt'), 'keep');
  manifest(root, [['../outside.txt', 'keep']]);
  assert.notEqual(verify(root).status, 0);
  assert.equal(readFileSync(path.join(parent, 'outside.txt'), 'utf8'), 'keep');
}));
