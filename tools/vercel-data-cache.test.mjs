import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('vercel.json', 'utf8'));

test('hashed data overrides broad no-cache while the manifest stays mutable', () => {
  const broad = config.routes.findIndex((route) => route.src === '/(.*)' && route.headers?.['Cache-Control'] === 'no-cache');
  const hashed = config.routes.findIndex((route) => route.src === '/data/(.*)\\.[a-f0-9]{16}\\.json');
  const manifest = config.routes.find((route) => route.src === '/data/data-manifest.json');
  assert.ok(broad >= 0);
  assert.ok(hashed > broad, 'Vercel applies later matching headers last');
  assert.equal(config.routes[hashed].headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(manifest?.headers?.['Cache-Control'], 'no-cache');
});
