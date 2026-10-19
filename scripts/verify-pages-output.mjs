import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '_site');
const manifestName = 'site-files.json';
const manifest = JSON.parse(readFileSync(path.join(root, manifestName), 'utf8'));
if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length < 1) throw new Error('Invalid site manifest');
const allowed = new Set([manifestName]);
function within(relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe manifest path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Path leaves the generated site');
  return target;
}
for (const entry of manifest.files) {
  const target = within(entry.path);
  if (allowed.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid manifest entry');
  if (!existsSync(target) || !lstatSync(target).isFile()) throw new Error(`Missing site file: ${entry.path}`);
  const digest = createHash('sha256').update(readFileSync(target)).digest('hex');
  if (digest !== entry.sha256) throw new Error(`Site file differs from the build: ${entry.path}`);
  allowed.add(entry.path);
}
// Verify the entire build before deleting files left by older releases.
let removed = 0, bytes = 0;
function prune(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relative = path.relative(root, target).split(path.sep).join('/');
    within(relative);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not permitted in the static site');
    if (entry.isDirectory()) {
      prune(target);
      if (readdirSync(target).length === 0) rmdirSync(target);
    } else if (!allowed.has(relative)) {
      bytes += lstatSync(target).size;
      unlinkSync(target);
      removed++;
    }
  }
}
prune(root);
console.log(JSON.stringify({ verified: manifest.files.length, removed, removedBytes: bytes }));
