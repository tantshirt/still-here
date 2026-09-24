import { expect, test } from '@playwright/test';
test('production scaffold is accessible and free of browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?seed=42');
  await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  await expect(page).toHaveTitle('STILL HERE');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('STILL HERE');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(errors).toEqual([]);
});
