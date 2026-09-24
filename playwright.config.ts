import { defineConfig } from '@playwright/test';
const deployed = process.env.PLAYWRIGHT_BASE_URL?.trim() || undefined;
export default defineConfig({
  testDir: './tests',
  use: { baseURL: deployed ?? 'http://127.0.0.1:4173' },
  webServer: deployed ? undefined : { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
