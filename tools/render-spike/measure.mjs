/* global window -- page.evaluate/waitForFunction callbacks run in the browser */
// Hardware timing for the render spike on THIS machine's GPU (not a phone, not emulation evidence).
// Usage: npm run build:spike && npx vite preview --config tools/render-spike/vite.config.mjs --port 4174
//        node tools/render-spike/measure.mjs [http://127.0.0.1:4174/] [out.json]
// Samples rAF intervals only; no readback, screenshot or capture runs while sampling.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:4174/';
const out = process.argv[3];
const profiles = [
  { name: 'laptop-retina', viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 },
  { name: 'desktop-1x', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone-viewport-on-this-gpu', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, note: 'viewport/DPR only; not phone hardware' },
];
const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const results = [];
try {
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor });
    await page.goto(`${url}?clean`);
    await page.waitForFunction(() => window.vatSpike?.ready || window.vatSpike?.error, undefined, { timeout: 60_000 });
    const error = await page.evaluate(() => window.vatSpike.error);
    if (error) throw new Error(error);
    for (const tier of ['high', 'medium', 'low']) {
      const result = await page.evaluate(async name => {
        const spike = window.vatSpike;
        spike.setTier(name);
        spike.setCamera('under');
        spike.setTime(0);
        return spike.measure({ seconds: 10, warmupFrames: 60 });
      }, tier);
      results.push({ profile: profile.name, profileNote: profile.note ?? null, deviceScaleFactor: profile.deviceScaleFactor, ...result });
      console.log(`${profile.name} ${tier}: ${result.meanFps?.toFixed(1)} fps mean, p95 ${result.p95FrameMs?.toFixed(1)} ms, ${result.drawingBuffer.join('x')} @ ${result.pixelRatio} — ${result.renderer}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
const record = { measuredAt: new Date().toISOString(), flags: 'headless Chromium, ANGLE Metal, vsync and frame-rate limit disabled', results };
if (out) await writeFile(out, JSON.stringify(record, null, 2));
