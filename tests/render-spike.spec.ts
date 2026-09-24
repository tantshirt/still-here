/* eslint-disable @typescript-eslint/no-explicit-any */
// Story 2.2 render spike: served from its isolated build (dist-spike) on :4174, never from the site.
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SPIKE = 'http://127.0.0.1:4174/';
const evidenceDir = process.env.SPIKE_EVIDENCE_DIR?.trim();
test.skip(!!process.env.PLAYWRIGHT_BASE_URL?.trim(), 'the render spike is not deployed; it runs only against the local isolated build');

async function open(page: Page, errors: string[], query = '?clean') {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(SPIKE + query);
  await page.waitForFunction(() => (window as any).vatSpike?.ready || (window as any).vatSpike?.error, undefined, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).vatSpike.error)).toBeNull();
}

const call = (page: Page, script: string) => page.evaluate(`(async () => { const s = window.vatSpike; ${script} })()`) as Promise<any>;
const shot = async (page: Page, name: string) => {
  const image = await page.screenshot();
  if (evidenceDir) await writeFile(join(evidenceDir, `${name}.png`), image);
  return image;
};

test.beforeAll(async () => { if (evidenceDir) await mkdir(evidenceDir, { recursive: true }); });

test('VAT figures sample on the GPU exactly as the independent decoder, in two instanced draws', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  expect(await page.locator('style').count()).toBe(0);
  expect(await page.locator('script:not([src])').count()).toBe(0);
  const gpu = await call(page, 'return s.verifyGpu();');
  expect(gpu.passed).toBe(true);
  expect(gpu.positionsCompared).toBeGreaterThanOrEqual(250);
  expect(gpu.maxErrorMetres).toBeLessThan(1e-5);
  const report = await call(page, 'return s.report();');
  expect(report.invariants.capacity).toEqual({ standing: 1520, wheelchair: 80, total: 1600 });
  expect(report.invariants.instancedMeshes).toBe(2);
  expect(report.lastFrame.figureDraws).toBe(2);
  expect(report.lastFrame.drawsByVariant).toEqual({ standing: 1, wheelchair: 1 });
  expect(report.textures).toHaveLength(6);
  expect(report.environment.renderer).toBeTruthy();
  expect(report.environment.webglVersion).toMatch(/WebGL 2/);
  if (evidenceDir) await writeFile(join(evidenceDir, 'gpu-check.json'), JSON.stringify({ environment: report.environment, gpu }, null, 2));
  expect(errors).toEqual([]);
});

test('tiers change only pixel ratio, bloom passes and haze path/samples', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  const reports: any[] = [];
  const frames: Buffer[] = [];
  for (const tier of ['high', 'medium', 'low']) {
    await call(page, `s.setCamera('under'); s.setTier('${tier}'); s.setPose('rest');`);
    reports.push(await call(page, 'return s.report();'));
    frames.push(await shot(page, `under-${tier}-rest`));
  }
  expect(reports.map(r => r.effective)).toEqual([
    { bloomLevels: 8, hazeSamples: 48, hazePath: 'raymarch' },
    { bloomLevels: 6, hazeSamples: 28, hazePath: 'raymarch' },
    { bloomLevels: 4, hazeSamples: 8, hazePath: 'screen-space-shafts' },
  ]);
  for (const r of reports) {
    expect(r.invariants).toEqual(reports[0].invariants);
    expect(r.pixelRatio).toBeLessThanOrEqual(r.tierConfig.pixelRatioCap);
    expect(r.lastFrame.figureDraws).toBe(2);
    expect(r.errors).toEqual([]);
  }
  expect(frames[0]!.equals(frames[2]!)).toBe(false);
  if (evidenceDir) await writeFile(join(evidenceDir, 'tier-reports.json'), JSON.stringify(reports, null, 2));
  expect(errors).toEqual([]);
});

test('raymarched haze respects light-side and camera-side occlusion', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  const result = await call(page, `
    s.setCamera('under'); s.setTier('high'); s.setPose('rest');
    const [arrival, , pit] = s.beams;
    const underSlab = [arrival.x, -9, arrival.z];
    const shadowed = s.probeWorld(underSlab);
    s.setLightOcclusion(false);
    const unshadowed = s.probeWorld(underSlab);
    s.setLightOcclusion(true);
    const openPit = s.probeWorld([pit.x, -9, pit.z]);
    const darkPit = s.probeWorld([pit.x + 9, -9, pit.z]);
    // The arrival beam above the slab is hidden behind the underside from Under: depth must stop the march.
    const hiddenBeam = [arrival.x, 6, arrival.z];
    const behindSlab = s.probeWorld(hiddenBeam);
    const openBeam = s.probeWorld([pit.x, 6, pit.z]);
    s.setHaze(false);
    const behindSlabNoHaze = s.probeWorld(hiddenBeam);
    const openBeamNoHaze = s.probeWorld([pit.x, 6, pit.z]);
    s.setHaze(true);
    return { shadowed, unshadowed, openPit, darkPit, behindSlab, behindSlabNoHaze, openBeam, openBeamNoHaze };`);
  for (const probe of Object.values(result) as any[]) expect(probe.onScreen).toBe(true);
  expect(result.unshadowed.mean - result.shadowed.mean).toBeGreaterThan(8);
  expect(result.openPit.mean - result.darkPit.mean).toBeGreaterThan(8);
  expect(Math.abs(result.behindSlab.mean - result.behindSlabNoHaze.mean)).toBeLessThan(4);
  expect(result.openBeam.mean - result.openBeamNoHaze.mean).toBeGreaterThan(8);
  for (const probe of Object.values(result) as any[]) expect(probe.channelSpread).toBeLessThanOrEqual(2);
  if (evidenceDir) await writeFile(join(evidenceDir, 'occlusion-probes.json'), JSON.stringify(result, null, 2));
  expect(errors).toEqual([]);
});

test('one unscaled clock: exact loop seam, event clamps, pause freezes, reduced motion holds rest', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await call(page, "s.setTier('low'); s.setCamera('figure');");
  await call(page, 's.setTime(0);');
  const zero = await page.screenshot();
  await call(page, 's.setTime(240);'); // LCM of the 10s idle loop and the 4.8s showcase cycle
  expect((await page.screenshot()).equals(zero)).toBe(true);
  await call(page, 's.setTime(1.45);');
  const falling = await page.screenshot();
  expect(falling.equals(zero)).toBe(false);
  await call(page, 's.setTime(1.45);');
  expect((await page.screenshot()).equals(falling)).toBe(true);
  await expect(call(page, 's.setTime(Number.NaN);')).rejects.toThrow(/finite/);
  await expect(call(page, "s.setPose('wave');")).rejects.toThrow(/unknown pose/);
  await expect(call(page, "s.setTier('ultra');")).rejects.toThrow(/unknown tier/);

  await call(page, 's.setTime(0); s.play();');
  await page.waitForFunction(() => (window as any).vatSpike.sceneT > 0.05, undefined, { timeout: 60_000 });
  const paused = await call(page, 's.pause(); return s.sceneT;');
  const pausedFrame = await page.screenshot();
  await page.waitForTimeout(600);
  expect(await call(page, 'return s.sceneT;')).toBe(paused);
  expect((await page.screenshot()).equals(pausedFrame)).toBe(true);

  await call(page, 's.setReducedMotion(true); s.setTime(0.3);');
  const restA = await page.screenshot();
  await call(page, 's.setTime(1.45);');
  expect((await page.screenshot()).equals(restA)).toBe(true);
  await call(page, 's.setTime(7.9);');
  expect((await page.screenshot()).equals(restA)).toBe(true);
  await call(page, 's.setReducedMotion(false); s.setTime(1.45);');
  expect((await page.screenshot()).equals(restA)).toBe(false);
  expect(errors).toEqual([]);
});

test('mismatched VAT bytes are reported, never substituted', async ({ page }) => {
  await page.route('**/vat/standing.fall.rgba16f', async route => {
    const response = await route.fetch();
    const body = Buffer.from(await response.body());
    body[64] = body[64]! ^ 0xff;
    await route.fulfill({ response, body });
  });
  await page.goto(SPIKE + '?clean');
  await page.waitForFunction(() => (window as any).vatSpike?.error, undefined, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).vatSpike.error)).toMatch(/standing\.fall\.rgba16f: sha256 mismatch/);
  expect(await page.evaluate(() => (window as any).vatSpike.ready)).toBe(false);
});

test('matched evidence captures and diagnostic timing with renderer identity', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  for (const [camera, pose] of [['under', 'fall'], ['under', 'dissolve'], ['level', 'rest'], ['above', 'rest'], ['figure', 'rest'], ['figure', 'step'], ['figure', 'fall']]) {
    await call(page, `s.setTier('high'); s.setCamera('${camera}'); s.setPose('${pose}');`);
    await shot(page, `${camera}-high-${pose}`);
  }
  await call(page, "s.setCamera('under'); s.setPose('rest'); s.setLightOcclusion(false);");
  await shot(page, 'under-high-rest-no-light-occlusion');
  await call(page, 's.setLightOcclusion(true);');
  const timings = [];
  for (const tier of ['high', 'medium', 'low']) {
    await call(page, `s.setTier('${tier}'); s.setCamera('under'); s.setTime(0);`);
    timings.push(await call(page, 'return s.measure({ seconds: 8, warmupFrames: 1 });'));
  }
  for (const timing of timings) {
    expect(timing.renderer).toBeTruthy();
    expect(timing.frames).toBeGreaterThan(0);
    if (/swiftshader|llvmpipe|software/i.test(timing.renderer)) expect(timing.diagnosticOnly).toBe(true);
  }
  await testInfo.attach('diagnostic-timing.json', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
  if (evidenceDir) await writeFile(join(evidenceDir, 'diagnostic-timing.json'), JSON.stringify(timings, null, 2));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tier of ['high', 'low']) {
    await call(page, `s.setTier('${tier}'); s.setCamera('under'); s.setPose('rest');`);
    await shot(page, `phone-under-${tier}-rest`);
  }
  expect(errors).toEqual([]);
});
