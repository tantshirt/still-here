import { expect, test } from '@playwright/test';

test('early Enter removes threshold on the gesture stack, holds black, then exposes scene semantics', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-09-24T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-24T00:01:00Z'));
  await page.addInitScript(() => {
    let constructions = 0;
    let onGesture = false;
    let gestureConstruction = false;
    window.addEventListener('keydown', () => { onGesture = true; queueMicrotask(() => { onGesture = false; }); }, true);
    class SilentContext {
      state = 'suspended';
      constructor() { constructions++; gestureConstruction = onGesture; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    }
    Object.defineProperty(window, 'AudioContext', { value: SilentContext });
    Object.assign(window, { entryProbe: () => ({ constructions, gestureConstruction }) });
  });
  await page.goto('/');
  await expect(page.locator('.threshold')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { entryProbe(): object }).entryProbe())).toEqual({ constructions: 0, gestureConstruction: false });
  const immediate = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { threshold: !!document.querySelector('.threshold'), scene: !!document.querySelector('.scene-surface') };
  });
  expect(immediate).toEqual({ threshold: false, scene: false });
  expect(await page.evaluate(() => (window as unknown as { entryProbe(): object }).entryProbe())).toEqual({ constructions: 1, gestureConstruction: true });
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('#app')).toBeEmpty();
  expect(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && (style.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)', 'rgb(0, 0, 0)'].includes(style.backgroundColor));
  }).length)).toBe(0);
  await page.screenshot({ path: info.outputPath('cut.png') });
  await page.clock.runFor(200);
  await page.keyboard.press('Enter');
  await page.clock.runFor(199);
  await expect(page.getByRole('img')).toHaveCount(0);
  await page.clock.runFor(1);
  const scene = page.getByRole('img', { name: 'World, Now' });
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAccessibleDescription('Modeled estimates and imagined lives.');
  await expect(scene).toBeFocused();
  await expect(scene).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.screenshot({ path: info.outputPath('scene.png') });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.threshold')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { entryProbe(): { constructions: number } }).entryProbe().constructions)).toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'enter' })).toHaveCount(1);
});

for (const activation of ['click', 'Enter', 'Space', 'touch']) {
  test(`native entry ${activation} completes`, async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const button = page.getByRole('button', { name: 'enter' });
    if (activation === 'click') await button.click();
    else if (activation === 'touch') await button.tap();
    else { await button.focus(); await page.keyboard.press(activation); }
    await expect(button).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
    await context.close();
  });
}

test('preserves owned, modified, composing and prevented Enter and non-entry gestures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByText('You could leave life right now.', { exact: true }).click();
  await page.mouse.wheel(0, 300);
  const result = await page.evaluate(() => {
    const outcomes: boolean[] = [];
    for (const html of ['<a href="#owned">link</a>', '<button>other</button>', '<input>', '<textarea></textarea>', '<select><option>one</option></select>', '<div contenteditable="true"><span>edit</span></div>', '<div role="button" tabindex="0">custom</div>']) {
      const host = document.createElement('div'); host.innerHTML = html; document.body.append(host);
      const element = host.querySelector('span') ?? host.firstElementChild!;
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      outcomes.push(!!document.querySelector('.threshold')); host.remove();
    }
    for (const extra of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { repeat: true }]) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ...extra }));
      outcomes.push(!!document.querySelector('.threshold'));
    }
    const prevented = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }); prevented.preventDefault(); window.dispatchEvent(prevented);
    outcomes.push(!!document.querySelector('.threshold'));
    return outcomes;
  });
  expect(result.every(Boolean)).toBe(true);
  await expect(page.locator('.threshold')).toHaveCount(1);
});

for (const failure of ['missing', 'throws', 'resume']) {
  test(`audio ${failure} still enters without page errors`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(failure => {
      Object.defineProperty(window, 'AudioContext', { value: failure === 'missing' ? undefined : class {
        state = 'suspended';
        constructor() { if (failure === 'throws') throw new Error('unavailable'); }
        resume() { return Promise.reject(new Error('denied')); }
        close() { return Promise.resolve(); }
      } });
    }, failure);
    await page.goto('/'); await page.keyboard.press('Enter');
    await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const activation of ['click', 'touch'] as const) {
  test(`trusted early ${activation} unlocks one native audio context before visual reveal`, async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const NativeContext = window.AudioContext;
      let constructions = 0;
      let audioState = () => 'absent';
      let trustedActivation = false;
      let constructedInActivation = false;
      let opacityAtActivation = '';
      document.addEventListener('pointerdown', () => {
        opacityAtActivation = getComputedStyle(document.querySelector('.threshold__enter')!).opacity;
      }, true);
      document.addEventListener('click', event => {
        trustedActivation = event.isTrusted;
      }, true);
      document.addEventListener('click', () => { trustedActivation = false; });
      window.AudioContext = class extends NativeContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          audioState = () => this.state;
          constructions++;
          constructedInActivation = trustedActivation && navigator.userActivation.isActive;
        }
      };
      Object.assign(window, { nativeAudioProbe: () => ({ constructions, state: audioState(), constructedInActivation, opacityAtActivation }) });
    });
    await page.goto('/');
    await page.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 0; }));
    const button = page.getByRole('button', { name: 'enter' });
    await expect(button).toHaveCSS('opacity', '0');
    const probe = () => page.evaluate(() => (window as unknown as { nativeAudioProbe(): { constructions: number; state: string; constructedInActivation: boolean; opacityAtActivation: string } }).nativeAudioProbe());
    expect(await probe()).toMatchObject({ constructions: 0, state: 'absent' });
    if (activation === 'click') await button.click();
    else await button.tap();
    await expect(button).toHaveCount(0);
    await expect.poll(probe).toMatchObject({ constructions: 1, state: 'running', constructedInActivation: true, opacityAtActivation: '0' });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
    expect(await probe()).toMatchObject({ constructions: 1, state: 'running' });
    await context.close();
  });
}

test('focused static tabindex container does not own Enter', async ({ page }) => {
  await page.goto('/');
  await page.locator('.threshold').evaluate(el => { const container = el as HTMLElement; container.tabIndex = -1; container.focus(); });
  await expect(page.locator('.threshold')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.threshold')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
});

test('app projects current reduced motion while keeping revealed text monotonic', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('.threshold')).toHaveClass(/threshold--revealed/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  await expect(page.locator('.threshold')).toHaveClass(/threshold--revealed/);
  await expect(page.getByRole('button', { name: 'enter' })).toHaveCSS('opacity', '1');
});
