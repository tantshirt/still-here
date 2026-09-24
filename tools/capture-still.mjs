#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { get } from 'node:http';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { STILL_OUTPUTS, STILL_QUERY } from './still-capture-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'stills');
const previewUrl = 'http://127.0.0.1:4175';

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

function previewReady() {
  return new Promise((resolve, reject) => {
    const request = get(`${previewUrl}/`, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', reject);
  });
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if (await previewReady()) return;
    } catch {
      // preview still starting
    }
    await delay(500);
  }
  throw new Error('preview server did not become ready');
}

async function main() {
  await run('npm', ['run', 'build']);
  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4175', '--strictPort'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  try {
    await waitForPreview();
    await mkdir(outDir, { recursive: true });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const output of STILL_OUTPUTS) {
      await page.setViewportSize({ width: output.width, height: output.height });
      await page.goto(`${previewUrl}/${STILL_QUERY}`);
      await page.waitForSelector('html[data-still-capture-ready="true"]', { timeout: 120_000 });
      await page.locator('.scene-canvas').waitFor({ state: 'attached', timeout: 120_000 });
      await page.screenshot({
        path: join(outDir, output.file),
        type: 'webp',
        quality: 92,
        clip: { x: 0, y: 0, width: output.width, height: output.height },
      });
    }
    await browser.close();
  } finally {
    preview.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
