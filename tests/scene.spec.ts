import { expect, test, type Browser } from '@playwright/test';

// Software GL so the real renderer runs in headless CI; this is the only spec that exercises it end to end.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

async function meanLuminance(browser: Browser, png: Buffer): Promise<number> {
  const probe = await browser.newPage();
  try {
    return await probe.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      return sum / (data.length / 4);
    }, png.toString('base64'));
  } finally {
    await probe.close();
  }
}

test('entering builds the live 3D scene instead of the fallback', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=42');
  await page.getByRole('button', { name: 'enter', exact: true }).click();

  const surface = page.locator('.scene-surface');
  await expect(surface).toHaveClass(/scene-surface--live/, { timeout: 60_000 });
  await expect(page.locator('.scene-status')).toBeHidden();

  const size = await page.locator('.scene-canvas').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    return { width: element.width, height: element.height };
  });
  expect(size.width).toBeGreaterThan(300);
  expect(size.height).toBeGreaterThan(150);

  // Hidden chrome stays hidden: no empty reflection box, no "return to now" before a year is chosen.
  await expect(page.locator('.reflection-panel')).toBeHidden();
  await expect(page.locator('.scene-return-to-now')).toBeHidden();
  await expect(page.getByRole('button', { name: 'controls', exact: true })).toBeVisible();

  const luminance = await meanLuminance(browser, await page.screenshot({ type: 'png' }));
  expect(luminance).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
