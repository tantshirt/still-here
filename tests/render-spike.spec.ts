/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, test } from '@playwright/test';

test('tracked spike validates VAT sampling, figures, tiers and motion controls', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('/tools/render-spike/index.html', { waitUntil: 'networkidle' });
  expect(await page.locator('style').count()).toBe(0);
  expect(await page.locator('script:not([src])').count()).toBe(0);
  await page.waitForFunction(() => (window as any).vatGPU?.ready, undefined, { timeout: 30_000 });
  const gpu = await page.evaluate(() => (window as any).vatGPU.verifyGPU());
  expect(gpu.passed).toBe(true);
  expect(gpu.positionsCompared).toBeGreaterThan(100);

  const reports: any[] = [];
  const tierFrames: Buffer[] = [];
  for (const tier of ['high', 'medium', 'low']) {
    await page.evaluate(name => { const api = (window as any).vatGPU; api.setTier(name); api.setCamera('under'); api.setPose('rest'); }, tier);
    reports.push(await page.evaluate(() => (window as any).vatGPU.report()));
    tierFrames.push(await page.locator('canvas').screenshot({ path: testInfo.outputPath(`under-${tier}-rest.png`) }));
  }
  for (const report of reports) {
    expect(report.totalFigures).toBe(1600);
    expect(report.showcaseSlots).toBe(4);
    expect(report.figureDraws).toBe(2);
    expect(report.variants.standing.total).toBe(1520);
    expect(report.variants.wheelchair.total).toBe(80);
    expect(report.variants.standing.total + report.variants.wheelchair.total).toBe(1600);
    expect(report.errors).toEqual([]);
    expect(report.environment.renderer).toBeTruthy();
  }
  expect(reports.map(report => report.tierConfig.path)).toEqual(['raymarch', 'raymarch', 'screen-space-shafts']);
  expect(reports.map(report => report.tierConfig.hazeSamples)).toEqual([48, 28, 8]);
  expect(reports.map(report => report.effectUniforms.samples)).toEqual([48, 28, 8]);
  expect(reports.map(report => report.effectUniforms.shaftMode)).toEqual([0, 0, 1]);
  expect(reports.map(report => report.effectUniforms.bloomStrength)).toEqual([0.2, 0.12, 0]);
  expect(tierFrames[0]?.equals(tierFrames[2] as Buffer)).toBe(false);
  expect(reports[0].pixelProbes).not.toEqual(reports[2].pixelProbes);

  await page.evaluate(() => { const api = (window as any).vatGPU; api.setTier('high'); api.setCamera('under'); api.setPose('fall'); });
  const fallFrame = await page.locator('canvas').screenshot({ path: testInfo.outputPath('under-high-fall.png') });
  expect(fallFrame.equals(tierFrames[0] as Buffer)).toBe(false);
  await page.evaluate(() => { const api = (window as any).vatGPU; api.setCamera('close'); api.setPose('rest'); });
  const closeRest = await page.locator('canvas').screenshot({ path: testInfo.outputPath('figure-close-rest.png') });
  await page.evaluate(() => (window as any).vatGPU.setPose('fall'));
  const closeFall = await page.locator('canvas').screenshot({ path: testInfo.outputPath('figure-close-fall.png') });
  expect(closeRest.equals(closeFall)).toBe(false);

  await page.evaluate(() => { const api = (window as any).vatGPU; api.setReducedMotion(true); api.play(); });
  expect(await page.evaluate(() => (window as any).vatGPU.report())).toMatchObject({ sceneT: 0, playing: false, reducedMotion: true });
  await expect(page.evaluate(() => (window as any).vatGPU.setTime(Number.NaN))).rejects.toThrow(/finite/);
  expect(browserErrors).toEqual([]);
});
