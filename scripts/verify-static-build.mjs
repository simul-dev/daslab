import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demos } from './demo-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
for (const page of ['index.html', 'index_en.html', 'resource.html', 'resource_en.html', 'demo.html', 'demo_en.html', 'CNAME']) {
  assert.deepEqual(await readFile(resolve(output, page)), await readFile(resolve(root, page)), page + ' must preserve homepage content');
}
for (const demo of demos) {
  const html = await readFile(resolve(output, demo.base.slice(1), 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  assert(references.length >= 2, demo.id + ': missing script or stylesheet references');
  assert(references.some(path => path.endsWith('.js')), demo.id + ': missing entry script');
  for (const reference of references) {
    // Existing homepage/Fulfillment font preconnects are intentionally preserved.
    if (/^https?:\/\//i.test(reference)) continue;
    assert(reference.startsWith(demo.base), demo.id + ': asset escapes base: ' + reference);
    const asset = resolve(output, reference.split(/[?#]/)[0].slice(1));
    assert(asset.startsWith(output + sep), 'Asset escapes assembled output');
    assert((await stat(asset)).isFile(), 'Missing asset: ' + reference);
  }
  assert((await stat(resolve(output, demo.base.slice(1), 'daslab_logo_dark_simple.png'))).isFile(), demo.id + ': missing brand asset');
  console.log('PASS ' + demo.id + ': index, JS/CSS, favicon and brand asset under ' + demo.base);
}
const hub = await readFile(resolve(output, 'demo.html'), 'utf8');
for (const demo of demos) assert(hub.includes('href="' + demo.base + '"'), demo.id + ': missing Demo Hub link');
console.log('PASS homepage copies, bilingual entry pages and both LIVE demo links');
