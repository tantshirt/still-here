import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

// Non-shipping fixture exercises the production CSS and council's exact copy.
const css = readFileSync('src/generated/tokens.css', 'utf8') + readFileSync('src/ui/fonts.css', 'utf8');
const study = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}
html{background:var(--colors-background);color:var(--colors-text-primary)}body{margin:0}
main{width:calc(100% - 40px);max-width:480px;margin:max(32px,calc(50vh - 190px)) auto 32px}
p{margin:0}.quote{margin-top:48px;font-size:var(--typography-quote-font-size);line-height:var(--typography-quote-line-height);letter-spacing:var(--typography-quote-letter-spacing)}.quote p+p{margin-top:24px}
button{display:block;margin:48px 0 0 auto;min-width:44px;min-height:44px;padding:0;border:0;background:none;color:var(--colors-text-secondary);font-family:inherit;font-size:var(--typography-action-font-size);line-height:var(--typography-action-line-height);letter-spacing:var(--typography-action-letter-spacing)}
</style></head><body><main><p>People are arriving. People are leaving.<br>You are still here.</p><div class="quote"><p>You could leave life right now.</p><p>Let that determine<br>what you do and say and think.</p></div><button>enter</button></main></body></html>`;

for (const width of [1440, 375, 320]) {
  for (const delivery of ['delayed', 'failed'] as const) {
    test(`threshold font ${delivery} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 812 });
      await page.route('**/font-study', route => route.fulfill({ contentType: 'text/html', body: study }));
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/*.woff2', async route => {
        if (delivery === 'failed') await route.abort();
        else { await held; await route.continue(); }
      });
      await page.goto('/font-study', { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => document.compatMode)).toBe('CSS1Compat');
      // Past font-display's short swap block; font is still withheld indefinitely.
      await page.waitForTimeout(150);
      await expect(page.getByText('You could leave life right now.')).toBeVisible();
      expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(false);
      const geometry = () => page.evaluate(() => [...document.querySelectorAll('p, button')].map(el => {
        const r = el.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(el);
        return { x: r.x, y: r.y, width: r.width, height: r.height,
          lines: [...new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => r.y))].length };
      }));
      const before = await geometry();
      // CDP captures the held-font frame without Playwright waiting for fonts.ready.
      const capture = await page.context().newCDPSession(page);
      const fallback = await capture.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(testInfo.outputPath('fallback.png'), Buffer.from(fallback.data, 'base64'));
      await capture.detach();
      release();
      await page.evaluate(() => document.fonts.ready);
      if (delivery === 'delayed') expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
      else expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(false);
      const after = await geometry();
      expect(after).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath('settled.png') });
      writeFileSync(testInfo.outputPath('geometry.json'), JSON.stringify({ before, after }, null, 2));
      await testInfo.attach('geometry', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
    });
  }
}

for (const delivery of ['delayed', 'failed'] as const) {
  test(`metadata 500 font ${delivery}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const metadata = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}
      html{background:var(--colors-background);color:var(--colors-text-primary)}
      p{margin:20px;font-family:var(--typography-metadata-font-family);font-size:var(--typography-metadata-font-size);font-weight:var(--typography-metadata-font-weight);line-height:var(--typography-metadata-line-height);letter-spacing:var(--typography-metadata-letter-spacing);text-transform:var(--typography-metadata-text-transform)}
      </style></head><body><p>THE WORLD · NOW</p></body></html>`;
    await page.route('**/metadata-study', route => route.fulfill({ contentType: 'text/html', body: metadata }));
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let requested = false;
    await page.route('**/geist-500-latin.woff2', async route => {
      requested = true;
      if (delivery === 'failed') await route.abort();
      else { await held; await route.continue(); }
    });
    await page.goto('/metadata-study', { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.compatMode)).toBe('CSS1Compat');
    await expect.poll(() => requested).toBe(true);
    await page.waitForTimeout(150);
    const sample = page.getByText('THE WORLD · NOW');
    await expect(sample).toBeVisible();
    await expect(sample).toHaveCSS('font-weight', '500');
    expect(await page.evaluate(() => document.fonts.check('500 12px Geist'))).toBe(false);
    const before = await sample.boundingBox();
    expect(before?.height).toBeGreaterThan(0);
    const capture = await page.context().newCDPSession(page);
    const fallback = await capture.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(testInfo.outputPath('fallback.png'), Buffer.from(fallback.data, 'base64'));
    await capture.detach();
    release();
    await page.evaluate(() => document.fonts.ready);
    const expected = delivery === 'delayed' ? 'loaded' : 'error';
    expect(await page.evaluate(() => [...document.fonts].find(face => face.family === 'Geist' && face.weight === '500')?.status)).toBe(expected);
    expect(await page.evaluate(() => document.fonts.check('500 12px Geist'))).toBe(delivery === 'delayed');
    await expect(sample).toBeVisible();
    expect(await sample.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('settled.png') });
  });
}
