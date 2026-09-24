import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('licensed static font inputs stay within the audited budget and hashes', () => {
  const expected = {
    'geist-400-latin.woff2': '7cf62d9cc4a6ac308881809209907914f30f2761e563eaf183742c778b8a70c2',
    'geist-500-latin.woff2': '2b8cde7211482aa3b55a022f5a810a1b170d16e6da7433fed09cf6e05b37bd2b',
  };
  assert.deepEqual(readdirSync('public/fonts').sort(), ['OFL.txt', ...Object.keys(expected)].sort());
  let bytes = 0;
  for (const [file, sha] of Object.entries(expected)) {
    const path = `public/fonts/${file}`;
    bytes += statSync(path).size;
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), sha);
  }
  assert.ok(bytes <= 60_000);
  assert.match(readFileSync('public/fonts/OFL.txt', 'utf8'), /SIL OPEN FONT LICENSE Version 1.1/);
  assert.match(readFileSync('index.html', 'utf8'), /rel="preload" href="\/fonts\/geist-400-latin.woff2" as="font" type="font\/woff2" crossorigin/);
});
