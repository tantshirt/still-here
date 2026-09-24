import { defineConfig } from '@playwright/test';
const deployed = process.env.PLAYWRIGHT_BASE_URL?.trim() || undefined;
// The render spike is served from its own isolated build (dist-spike) and never from the production site.
export const SPIKE_URL = 'http://127.0.0.1:4174';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: deployed ?? 'http://127.0.0.1:4173' },
  webServer: deployed ? undefined : [
    { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
    { command: 'npx vite preview --config tools/render-spike/vite.config.mjs --port 4174 --strictPort', url: SPIKE_URL, reuseExistingServer: false },
  ],
});
