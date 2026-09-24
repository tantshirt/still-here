import { expect, test } from '@playwright/test';

const groups = [
  'People are arriving. People are leaving.\nYou are still here.',
  'You could leave life right now.',
  'Let that determine\nwhat you do and say and think.',
];

test('exact copy and accessible tree exist before visual arrival; early keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 0; }));
  await expect(page).toHaveTitle('STILL HERE');
  expect(await page.locator('.threshold__group').allInnerTexts()).toEqual(groups);
  expect((await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()).toBe(`${groups.join(' ')} enter`.replace(/\s+/g, ' '));
  const tree = await page.getByRole('main').ariaSnapshot();
  expect(tree).toContain('People are arriving. People are leaving. You are still here.');
  expect(tree).toContain('You could leave life right now.');
  expect(tree).toContain('Let that determine what you do and say and think.');
  expect(tree).toContain('button "enter"');
  expect(tree.indexOf('People')).toBeLessThan(tree.indexOf('You could'));
  expect(tree.indexOf('You could')).toBeLessThan(tree.indexOf('Let that'));
  expect(tree.indexOf('Let that')).toBeLessThan(tree.indexOf('button'));
  await expect(page.getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(1);
  await expect(page.locator('.threshold__group').first()).toHaveCSS('opacity', '0');
  await expect(page.getByRole('button')).toHaveCSS('opacity', '0');
  await page.keyboard.press('Tab');
  const enter = page.getByRole('button', { name: 'enter' });
  await expect(enter).toBeFocused();
  await expect(enter).toHaveCSS('opacity', '1');
  await expect(enter).toHaveCSS('outline-width', '2px');
  await expect(enter).toHaveCSS('outline-style', 'solid');
  await expect(enter).toHaveCSS('outline-offset', '3px');
  await expect(enter).toHaveCSS('outline-color', 'rgb(230, 230, 230)');
  await expect(enter).toHaveCSS('color', 'rgb(242, 242, 242)');
});

test('production reveal timings include the black opening, gaps and final hold', async ({ page }) => {
  await page.goto('/');
  const timings = await page.evaluate(() => document.getAnimations().map(animation => {
    animation.pause();
    const timing = animation.effect!.getTiming();
    // CSS timing functions are stored on keyframes, not the WAAPI effect easing.
    const effect = animation.effect as KeyframeEffect;
    return { delay: Math.round(timing.delay ?? 0), duration: timing.duration, easing: getComputedStyle(effect.target!).animationTimingFunction };
  }));
  expect(timings).toEqual([
    { delay: 400, duration: 600, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { delay: 1300, duration: 600, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { delay: 2200, duration: 600, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    { delay: 4300, duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  ]);
  for (const [time, expected] of [[399, [0, 0, 0, 0]], [1000, [1, 0, 0, 0]], [1900, [1, 1, 0, 0]], [2800, [1, 1, 1, 0]], [4299, [1, 1, 1, 0]], [4500, [1, 1, 1, 1]]] as const) {
    const opacities = await page.evaluate(time => {
      document.getAnimations().forEach(animation => { animation.currentTime = time; });
      return [...document.querySelectorAll('.threshold__group, .threshold__enter')].map(el => Number(getComputedStyle(el).opacity));
    }, time);
    expect(opacities).toEqual([...expected]);
  }
  const halfway = await page.evaluate(() => {
    document.getAnimations().forEach(animation => { animation.currentTime = 700; });
    return Number(getComputedStyle(document.querySelector('.threshold__group')!).opacity);
  });
  expect(halfway).toBeGreaterThan(0);
  expect(halfway).toBeLessThan(1);
});

test('natural playback reveals each group and enter, which stays revealed after focus and blur', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const copy = page.locator('.threshold__group');
  // Real wall-clock playback: a globally paused animation must fail this test.
  await expect(copy.nth(0)).toHaveCSS('opacity', '1', { timeout: 1700 });
  await expect(copy.nth(1)).toHaveCSS('opacity', '1', { timeout: 1400 });
  await expect(copy.nth(2)).toHaveCSS('opacity', '1', { timeout: 1400 });
  const enter = page.getByRole('button', { name: 'enter' });
  await expect(enter).toHaveCSS('opacity', '1', { timeout: 2200 });
  await page.keyboard.press('Tab');
  await expect(enter).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(enter).not.toBeFocused();
  // Inspect immediately: retrying could conceal a restarted reveal.
  expect(await enter.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

for (const preference of ['at load', 'changed live']) {
  test(`reduced motion ${preference} reveals all text immediately`, async ({ page }) => {
    if (preference === 'at load') await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => {
      // Registered after the production listener: capture its result in the
      // same event-delivery turn, not in a later Playwright command.
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
        document.documentElement.dataset[`motionDelivery${event.matches ? 'Reduced' : 'Normal'}`] = JSON.stringify({
          revealed: document.querySelector('.threshold')!.classList.contains('threshold--revealed'),
          presentation: [...document.querySelectorAll('.threshold__group, .threshold__enter')].map(el => ({
            opacity: getComputedStyle(el).opacity, animation: getComputedStyle(el).animationName,
          })),
        });
      });
    });
    const revealed = {
      revealed: true,
      presentation: Array.from({ length: 4 }, () => ({ opacity: '1', animation: 'none' })),
    };
    if (preference === 'changed live') {
      await page.evaluate(() => {
        document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 0; });
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Computed CSS updates before the browser delivers the media-query event.
      // Keep this preference until it is actually delivered, rather than letting
      // two emulation commands coalesce before any rendering update observes it.
      await page.waitForFunction(() => document.documentElement.dataset.motionDeliveryReduced !== undefined);
      expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.motionDeliveryReduced!))).toEqual(revealed);
    }
    expect(await page.locator('.threshold').evaluate(el => el.classList.contains('threshold--revealed'))).toBe(true);
    for (const item of await page.locator('.threshold__group, .threshold__enter').all()) {
      await expect(item).toHaveCSS('opacity', '1');
      await expect(item).toHaveCSS('animation-name', 'none');
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await page.locator('.threshold__group, .threshold__enter').evaluateAll(elements =>
      elements.map(el => ({ opacity: getComputedStyle(el).opacity, animation: getComputedStyle(el).animationName })),
    )).toEqual(Array.from({ length: 4 }, () => ({ opacity: '1', animation: 'none' })));
    await page.waitForFunction(() => document.documentElement.dataset.motionDeliveryNormal !== undefined);
    expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.motionDeliveryNormal!))).toEqual(revealed);
    expect(await page.locator('.threshold__group, .threshold__enter').evaluateAll(elements =>
      elements.map(el => ({ opacity: getComputedStyle(el).opacity, animation: getComputedStyle(el).animationName })),
    )).toEqual(revealed.presentation);
  });
}

test('a delivered reduction remains readable when the current preference has already changed back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const preference = matchMedia(query);
      if (query === '(prefers-reduced-motion: reduce)') {
        // Exercise the event boundary with a queued reduction whose live value
        // is already false. Real delivery timing is covered by the tests above.
        document.addEventListener('test-deliver-reduction', () => {
          preference.dispatchEvent(new MediaQueryListEvent('change', { matches: true, media: query }));
        }, { once: true });
      }
      return preference;
    };
  });
  await page.goto('/');
  const initial = await page.evaluate(() => {
    document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 0; });
    return {
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      revealed: document.querySelector('.threshold')!.classList.contains('threshold--revealed'),
      opacities: [...document.querySelectorAll('.threshold__group, .threshold__enter')].map(el => getComputedStyle(el).opacity),
    };
  });
  expect(initial).toEqual({ reduced: false, revealed: false, opacities: ['0', '0', '0', '0'] });
  const presentation = await page.evaluate(() => {
    document.dispatchEvent(new Event('test-deliver-reduction'));
    return [...document.querySelectorAll('.threshold__group, .threshold__enter')].map(el => ({
      opacity: getComputedStyle(el).opacity, animation: getComputedStyle(el).animationName,
    }));
  });
  expect(presentation).toEqual(Array.from({ length: 4 }, () => ({ opacity: '1', animation: 'none' })));
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 320, height: 812 }, { width: 320, height: 360 }]) {
  for (const zoom of [1, 2]) {
    test(`threshold at ${viewport.width}x${viewport.height}, ${zoom * 100}% text`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      if (zoom === 2) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => {
        const column = document.querySelector<HTMLElement>('.threshold')!;
        const rect = column.getBoundingClientRect();
        const paragraphs = [...column.querySelectorAll('p')].map(el => el.getBoundingClientRect().x);
        return { x: rect.x, width: rect.width, center: rect.y + rect.height / 2, paragraphs,
          overflow: column.scrollWidth > column.clientWidth,
          pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          firstTop: column.firstElementChild!.getBoundingClientRect().top, top: rect.top,
        };
      });
      expect(geometry.width).toBeLessThanOrEqual(480);
      expect(geometry.x).toBeGreaterThan(0);
      expect(geometry.center).toBeLessThan(viewport.height / 2);
      expect(geometry.paragraphs.every(x => x === geometry.paragraphs[0])).toBe(true);
      expect(geometry.overflow).toBe(false);
      expect(geometry.pageOverflow).toBe(false);
      expect(geometry.firstTop).toBeGreaterThanOrEqual(geometry.top);
      const enter = page.getByRole('button', { name: 'enter' });
      await expect(enter).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(enter).toHaveCSS('border-width', '0px');
      await expect(enter).toHaveCSS('color', 'rgb(168, 168, 168)');
      const box = await enter.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath('threshold-top.png') });
      await page.locator('.threshold').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(enter).toBeInViewport({ ratio: 1 });
      await enter.hover();
      await expect(enter).toHaveCSS('color', 'rgb(242, 242, 242)');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('threshold-end.png') });
    });
  }
}

test('threshold stays flat and silent, including failed font delivery', async ({ page }) => {
  let audioCreated = false;
  await page.exposeFunction('audioCreated', () => { audioCreated = true; });
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(options?: AudioContextOptions) {
        super(options);
        void (window as unknown as { audioCreated(): Promise<void> }).audioCreated();
      }
    };
  });
  const audioRequests: string[] = [];
  page.on('request', request => { if (/\.(mp3|ogg|wav|m4a)(\?|$)/.test(request.url())) audioRequests.push(request.url()); });
  await page.route('**/*.woff2', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText('You could leave life right now.', { exact: true })).toBeVisible();
  await expect(page.locator('audio, video, canvas, img, svg, a, [role="button"]')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/births|deaths|data|world|visualization/i);
  expect(await page.evaluate(() => [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundImage.includes('gradient')))).toBe(false);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  expect(audioCreated).toBe(false);
  expect(audioRequests).toEqual([]);
});

test('native keyboard scrolling reaches every fallback-font line at 320px and 200% text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await page.route('**/*.woff2', route => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Geist'))).toBe(false);
  const column = page.locator('.threshold');
  // Reach the scroll area by keyboard alone, then read it from the top.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'enter' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect.poll(() => column.evaluate(el => el.scrollTop)).toBe(0);
  const seen = new Set<number>();
  let total = 0;
  let reachedEnd = false;
  for (let step = 0; step < 80; step++) {
    const state = await column.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const lines = [...el.querySelectorAll('p')].flatMap(paragraph => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        return [...range.getClientRects()].filter(rect => rect.width > 0);
      });
      return {
        visible: lines.map((rect, index) => ({ rect, index })).filter(({ rect }) => rect.top >= bounds.top && rect.bottom <= bounds.bottom).map(({ index }) => index),
        total: lines.length,
        end: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
        overflow: el.scrollWidth > el.clientWidth || document.documentElement.scrollWidth > innerWidth,
      };
    });
    state.visible.forEach(index => seen.add(index));
    total = state.total;
    expect(state.overflow).toBe(false);
    if (state.end) { reachedEnd = true; break; }
    await page.keyboard.press('ArrowDown');
    // Let the browser finish native smooth key scrolling before measuring lines.
    await page.waitForTimeout(100);
  }
  expect(reachedEnd).toBe(true);
  expect(seen.size).toBe(total);
  await expect(page.getByRole('button', { name: 'enter' })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('fallback-keyboard-end.png') });
  await page.keyboard.press('Home');
  await expect.poll(() => column.evaluate(el => el.scrollTop)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('fallback-keyboard-top.png') });
});
