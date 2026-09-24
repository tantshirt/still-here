import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSiteUrl, DEFAULT_SITE_URL } from './site-url.mjs';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

test('site URL defaults and build metadata are absolute origins', () => {
  assert.equal(resolveSiteUrl(), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl({ VERCEL_URL: 'still-here-preview.vercel.app' }), 'https://still-here-preview.vercel.app');
  assert.equal(resolveSiteUrl({ SITE_URL: 'http://localhost:4173/' }), 'http://localhost:4173');
  assert.equal(resolveSiteUrl({ SITE_URL: 'https://still-here-one-eosin.vercel.app/', VERCEL_URL: 'preview.vercel.app' }), DEFAULT_SITE_URL);
});
test('production uses its stable domain while previews use their deployment origin', () => {
  assert.equal(resolveSiteUrl({ VERCEL_ENV: 'production', VERCEL_URL: 'ephemeral.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'stable.vercel.app' }), 'https://stable.vercel.app');
  assert.equal(resolveSiteUrl({ VERCEL_ENV: 'production', VERCEL_URL: 'ephemeral.vercel.app' }), DEFAULT_SITE_URL);
  assert.equal(resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'preview.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'stable.vercel.app' }), 'https://preview.vercel.app');
});

test('real Vite build emits explicit canonical and consumes compiled SITE_URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'still-here-site-url-'));
  try {
    await mkdir(join(dir, 'src'));
    await copyFile('src/site.ts', join(dir, 'src/site.ts'));
    await writeFile(join(dir, 'index.html'), '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>');
    await writeFile(join(dir, 'src/main.ts'), "import { SITE_URL } from './site'; globalThis.compiledSite = SITE_URL;");
    const origin = 'https://explicit-build.example';
    const result = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--config', resolve('vite.config.ts')], {
      cwd: dir, env: { ...process.env, SITE_URL: origin }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const html = await readFile(join(dir, 'dist/index.html'), 'utf8');
    assert.match(html, /<link rel="canonical" href="https:\/\/explicit-build\.example">/);
    const asset = html.match(/src="([^"]+\.js)"/)[1];
    const script = await readFile(join(dir, 'dist', asset), 'utf8');
    const context = { document: { createElement: () => ({ relList: { supports: () => true } }) } };
    runInNewContext(script, context);
    assert.equal(context.compiledSite, origin);
    assert.doesNotMatch(script, /__SITE_URL__/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('invalid build URL fails closed', () => {
  for (const SITE_URL of ['', 'relative', '//example.com', 'javascript:alert(1)', 'http://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com/?q=x', 'https://example.com/#x']) {
    assert.throws(() => resolveSiteUrl({ SITE_URL }), /SITE_URL/);
  }
  assert.throws(() => resolveSiteUrl({ VERCEL_URL: 'https://example.com' }), /SITE_URL/);
});
