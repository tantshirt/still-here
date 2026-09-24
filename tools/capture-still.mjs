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

/* global document, Image -- evaluated inside the browser page */
/** Mean 0–255 luminance of a screenshot, decoded in a blank page so the app's CSP never applies. */
async function meanLuminance(browser, buffer) {
  const probe = await browser.newPage();
  try {
    return await probe.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      return sum / (data.length / 4);
    }, buffer.toString('base64'));
  } finally {
    await probe.close();
  }
}

// A solid-black frame means the scene never drew; never ship that as the fallback still.
const MIN_MEAN_LUMINANCE = 2;

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
    // Software GL keeps captures deterministic on machines without a headless GPU.
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    for (const output of STILL_OUTPUTS) {
      await page.setViewportSize({ width: output.width, height: output.height });
      await page.goto(`${previewUrl}/${STILL_QUERY}`);
      await page.waitForSelector('html[data-still-capture-ready="true"]', { timeout: 120_000 });
      await page.locator('.scene-canvas').waitFor({ state: 'attached', timeout: 120_000 });
      const clip = { x: 0, y: 0, width: output.width, height: output.height };
      const luminance = await meanLuminance(browser, await page.screenshot({ type: 'png', clip }));
      if (luminance < MIN_MEAN_LUMINANCE) {
        throw new Error(`${output.file}: capture is near-black (mean luminance ${luminance.toFixed(2)}); the scene did not render`);
      }
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
