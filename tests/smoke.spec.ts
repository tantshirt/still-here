import { expect, test } from '@playwright/test';
test('production threshold is accessible and free of browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const fontRequests: string[] = [];
  const fontResponses: { url: string; status: number }[] = [];
  page.on('request', request => { if (request.url().endsWith('/fonts/geist-400-latin.woff2')) fontRequests.push(request.url()); });
  page.on('response', response => { if (response.url().endsWith('/fonts/geist-400-latin.woff2')) fontResponses.push({ url: response.url(), status: response.status() }); });
  await page.goto('/?seed=42');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page).toHaveTitle('STILL HERE');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: 'enter', exact: true })).toBeAttached();
  await expect(page.getByText('You could leave life right now.', { exact: true })).toBeAttached();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.evaluate(() => document.fonts.ready);
  const fontState = await page.evaluate(() => {
    const preload = document.querySelector<HTMLLinkElement>('link[rel="preload"][as="font"]');
    return {
      family: getComputedStyle(document.body).fontFamily,
      loaded: [...document.fonts].some(face => face.family === 'Geist' && face.weight === '400' && face.status === 'loaded'),
      url: new URL('/fonts/geist-400-latin.woff2', location.href).href,
      preload: preload?.href,
      origin: location.origin,
      resources: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('/fonts/geist-400-latin.woff2')).map(entry => ({ name: entry.name, initiator: (entry as PerformanceResourceTiming).initiatorType })),
    };
  });
  expect(fontState.family.split(',')[0]?.replaceAll('"', '').trim()).toBe('Geist');
  expect(fontState.loaded).toBe(true);
  expect(new URL(fontState.url).origin).toBe(fontState.origin);
  expect(fontState.preload).toBe(fontState.url);
  expect(fontRequests).toEqual([fontState.url]);
  expect(fontResponses).toEqual([{ url: fontState.url, status: 200 }]);
  expect(fontState.resources).toEqual([{ name: fontState.url, initiator: 'link' }]);
  expect(errors).toEqual([]);
});
