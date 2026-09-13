import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const html = await readFile(join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
let references = 0;

async function checkReference(reference, source) {
  if (/^(?:https?:|data:|blob:|mailto:)/.test(reference)) return;
  if (reference.startsWith('#')) {
    assert(ids.includes(reference.slice(1)), `Missing anchor ${reference}`);
    return;
  }
  assert(!reference.startsWith('/'), `Root-relative URL breaks project hosting: ${reference}`);
  const path = reference.split(/[?#]/)[0];
  if (!path) return;
  const target = resolve(dirname(source), path);
  assert(!relative(root, target).startsWith('..'), `Reference escapes website: ${reference}`);
  const info = await stat(target);
  if (info.isDirectory()) await stat(join(target, 'index.html'));
  references++;
}

for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  await checkReference(match[1], join(root, 'index.html'));
}
for (const name of await readdir(root)) {
  const path = join(root, name);
  if (name.endsWith('.json')) JSON.parse(await readFile(path, 'utf8'));
  if (!name.endsWith('.js')) continue;
  const source = await readFile(path, 'utf8');
  const patterns = [
    /(?:^|[;\n])\s*(?:import|export)\s*(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/g,
    /\b(?:fetch|URL)\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) await checkReference(match[1], path);
  }
}
assert(html.includes('name="viewport"'), 'Mobile viewport is required');
console.log(`Website checked: ${ids.length} unique IDs, ${references} local references, valid JSON assets.`);
