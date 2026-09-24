import { expect, test } from '@playwright/test';

test('keyboard path reaches controls and scene semantics stay intact', async ({ page }) => {
  // `controls` appears only once the live scene is ready, which includes the VAT download and software-GL build.
  test.setTimeout(90_000);
  await page.goto('/');
  await page.keyboard.press('Enter');
  const scene = page.getByRole('img', { name: 'World, Now' });
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAccessibleDescription(/Modeled estimates and imagined lives\./);
  const controls = page.getByRole('button', { name: 'controls' });
  await controls.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Controls' })).toHaveCount(0);
  await expect(controls).toBeFocused();
});

test('reduced motion is reflected on the document root', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
});

test('live region does not spam per simulation frame', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
  const updates = await page.evaluate(async () => {
    const region = document.querySelector('.sr-live');
    if (!region) return 0;
    let count = 0;
    const observer = new MutationObserver(() => { count += 1; });
    observer.observe(region, { characterData: true, childList: true, subtree: true });
    await new Promise<void>(resolve => { setTimeout(resolve, 4000); });
    observer.disconnect();
    return count;
  });
  expect(updates).toBeLessThan(6);
});
