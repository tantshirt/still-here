import { expect, test } from '@playwright/test';
import { DEFAULT_SITE_URL } from '../tools/site-url.mjs';

const hosted = process.env.PLAYWRIGHT_BASE_URL?.trim();

test('production HTML carries absolute share metadata on assigned domain', async ({ page, request }) => {
  test.skip(!hosted, 'Hosted launch checks require PLAYWRIGHT_BASE_URL.');
  await page.goto('/');
  await expect(page).toHaveTitle('STILL HERE');
  const origin = new URL(hosted!).origin;
  expect(origin).toMatch(/still-here.*\.vercel\.app$/);
  const meta = await page.locator('head meta[property="og:image"], head meta[name="twitter:image"]').evaluateAll(
    elements => Object.fromEntries(elements.map(el => [el.getAttribute('property') ?? el.getAttribute('name'), el.getAttribute('content')])),
  );
  expect(meta['og:image']).toBe(`${origin}/stills/share.webp`);
  expect(meta['twitter:image']).toBe(`${origin}/stills/share.webp`);
  expect(await page.locator('meta[property="og:description"]').count()).toBe(0);

  const stillResponse = await request.get('/stills/share.webp');
  expect(stillResponse.status()).toBe(200);
  expect(stillResponse.headers()['cache-control']).toContain('immutable');

  const geoResponse = await request.get('/api/geo');
  expect(geoResponse.status()).toBe(200);
  expect(geoResponse.headers()['cache-control']).toContain('no-store');
});

test('assigned default domain constant matches vercel production pattern', () => {
  expect(DEFAULT_SITE_URL).toBe('https://still-here-one-eosin.vercel.app');
});
