import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SITE_URL } from './site-url.mjs';
import { STILL_SHARE_ALT } from './still-capture-config.mjs';

test('production build emits share metadata and still preloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'still-here-share-meta-'));
  try {
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'index.html'), '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>');
    await writeFile(join(dir, 'src/main.ts'), 'export {}');
    const origin = 'https://share-build.example';
    const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--config', resolve('vite.config.ts')], {
      cwd: dir, env: { ...process.env, SITE_URL: origin }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const html = await readFile(join(dir, 'dist/index.html'), 'utf8');
    const image = `${origin}/stills/share.webp`;
    assert.match(html, new RegExp(`property="og:title" content="STILL HERE"`));
    assert.match(html, new RegExp(`property="og:image" content="${image.replaceAll('/', '\\/')}"`));
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, new RegExp(`property="og:image:alt" content="${STILL_SHARE_ALT.replaceAll('.', '\\.')}"`));
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:title" content="STILL HERE"/);
    assert.match(html, new RegExp(`name="twitter:image" content="${image.replaceAll('/', '\\/')}"`));
    assert.doesNotMatch(html, /og:description/);
    assert.match(html, /rel="preload" as="image" href="\/stills\/fallback-mobile\.webp"/);
    assert.match(html, /rel="preload" as="image" href="\/stills\/fallback-desktop\.webp"/);
    assert.match(html, new RegExp(`rel="canonical" href="${origin}"`));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('share metadata defaults to assigned production origin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'still-here-share-default-'));
  try {
    await mkdir(join(dir, 'src'));
    await writeFile(join(dir, 'index.html'), '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>');
    await writeFile(join(dir, 'src/main.ts'), 'export {}');
    const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--config', resolve('vite.config.ts')], {
      cwd: dir, env: { ...process.env, SITE_URL: undefined, VERCEL_URL: undefined }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const html = await readFile(join(dir, 'dist/index.html'), 'utf8');
    assert.match(html, new RegExp(`content="${DEFAULT_SITE_URL}/stills/share.webp"`));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
