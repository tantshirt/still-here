import { expect, test } from '@playwright/test';

test('threshold and entry leave no persistent visitor trace', async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  const cookieResponses: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => { if (response.headers()['set-cookie']) cookieResponses.push(response.url()); });
  await page.addInitScript(() => {
    const violations: string[] = [];
    let installs = 0;
    const writes: string[] = [];
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    Object.defineProperty(document, 'cookie', { get: () => cookie.get!.call(document), set: value => { writes.push('cookie'); cookie.set!.call(document, value); } });
    const observeStorage = (name: string, storage: Storage) => new Proxy(storage, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (['setItem', 'removeItem', 'clear'].includes(String(key))) writes.push(`${name}.${String(key)}`);
          return Reflect.apply(value, target, args);
        };
      },
      set(target, key, value) { writes.push(`${name}.${String(key)}`); return Reflect.set(target, key, value, target); },
      deleteProperty(target, key) { writes.push(`${name}.delete.${String(key)}`); return Reflect.deleteProperty(target, key); },
    });
    Object.defineProperty(window, 'localStorage', { value: observeStorage('localStorage', window.localStorage) });
    Object.defineProperty(window, 'sessionStorage', { value: observeStorage('sessionStorage', window.sessionStorage) });
    for (const method of ['open', 'deleteDatabase'] as const) {
      const original = indexedDB[method].bind(indexedDB);
      Object.defineProperty(indexedDB, method, { value: (...args: [string]) => { writes.push(`indexedDB.${method}`); return original(...args); } });
    }
    const cookieStore = Reflect.get(window, 'cookieStore');
    if (cookieStore) for (const method of ['set', 'delete']) {
      const original = Reflect.get(cookieStore, method).bind(cookieStore);
      Reflect.set(cookieStore, method, (...args: unknown[]) => { writes.push(`cookieStore.${method}`); return original(...args); });
    }
    for (const method of ['open', 'delete'] as const) {
      const original = caches[method].bind(caches);
      Object.defineProperty(caches, method, { value: (...args: [string]) => { writes.push(`caches.${method}`); return original(...args); } });
    }
    const register = navigator.serviceWorker?.register.bind(navigator.serviceWorker);
    if (register) Object.defineProperty(navigator.serviceWorker, 'register', { value: (...args: Parameters<ServiceWorkerContainer['register']>) => { writes.push('serviceWorker.register'); return register(...args); } });
    document.addEventListener('securitypolicyviolation', event => violations.push(event.violatedDirective));
    window.addEventListener('beforeinstallprompt', () => installs++);
    Object.assign(window, { privacyProbe: () => ({ violations, installs, writes }) });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'enter' })).toBeAttached();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('img', { name: 'World, Now' })).toBeVisible();
  expect(requests.every(url => new URL(url).origin === new URL(baseURL!).origin)).toBe(true);
  expect(await context.cookies()).toEqual([]);
  expect(cookieResponses).toEqual([]);
  const state = await page.evaluate(async () => ({
    local: localStorage.length,
    session: Object.keys(sessionStorage),
    databases: await indexedDB.databases(),
    workers: await navigator.serviceWorker.getRegistrations(),
    caches: await caches.keys(),
    probe: (window as unknown as { privacyProbe(): { violations: string[]; installs: number } }).privacyProbe(),
  }));
  expect(state).toEqual({ local: 0, session: [], databases: [], workers: [], caches: [], probe: { violations: [], installs: 0, writes: [] } });
  await expect(page.locator('link[rel="manifest"], vercel-live-feedback, [data-vercel-toolbar], [role="progressbar"], progress, .spinner')).toHaveCount(0);
});

test('hosted HTML, assets, fonts and missing routes deliver the privacy envelope', async ({ page, request }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL?.trim(), 'Privacy headers are delivered by Vercel, not Vite preview.');
  await page.goto('/');
  const assets = await page.locator('script[src], link[rel="stylesheet"]').evaluateAll(elements => elements.map(el => el.getAttribute('src') ?? el.getAttribute('href')!));
  expect(assets.length).toBeGreaterThan(0);
  const missing = ['/privacy-audit-missing', '/manifest.webmanifest', '/assets/missing.js', '/fonts/missing.woff2'];
  for (const path of ['/', '/index.html', ...missing, '/fonts/geist-400-latin.woff2', ...assets]) {
    const response = await request.get(path);
    const headers = response.headers();
    if (missing.includes(path)) expect(response.status()).toBe(404);
    else expect(response.status()).toBe(200);
    if (!missing.includes(path)) {
      if (path.endsWith('.js')) expect(headers['content-type']).toMatch(/javascript/);
      if (path.endsWith('.css')) expect(headers['content-type']).toContain('text/css');
      if (path.endsWith('.woff2')) expect(headers['content-type']).toContain('font/woff2');
    }
    const directives = headers['content-security-policy']!.split(';').map(value => value.trim()).filter(Boolean).map(value => value.split(/\s+/));
    expect(directives).toHaveLength(13);
    expect(Object.fromEntries(directives.map(([name, ...values]) => [name, values]))).toEqual({
      'default-src': ["'none'"], 'script-src': ["'self'"], 'style-src': ["'self'"],
      'font-src': ["'self'"], 'img-src': ["'self'"], 'connect-src': ["'self'"],
      'media-src': ["'self'"], 'worker-src': ["'self'"], 'manifest-src': ["'none'"],
      'object-src': ["'none'"], 'base-uri': ["'none'"], 'form-action': ["'none'"], 'frame-ancestors': ["'none'"],
    });
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['permissions-policy']).toBe('geolocation=(), camera=(), microphone=()');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['set-cookie']).toBeUndefined();
    if (!missing.includes(path) && path.startsWith('/assets/')) expect(path).toMatch(/-[A-Za-z0-9_-]{8,}\.[^/]+$/);
    expect(headers['cache-control']).toContain(!missing.includes(path) && (path.startsWith('/assets/') || path.startsWith('/fonts/')) ? 'immutable' : 'no-cache');
  }

  const manifestResponse = await request.get('/data/data-manifest.json');
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()['cache-control']).toContain('no-cache');
  const manifest = await manifestResponse.json() as { files: Record<string, string> };
  const worldPath = manifest.files['world.json'];
  expect(worldPath).toMatch(/^world\.[a-f0-9]{16}\.json$/);
  const worldResponse = await request.get(`/data/${worldPath}`);
  expect(worldResponse.status()).toBe(200);
  expect(worldResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});
