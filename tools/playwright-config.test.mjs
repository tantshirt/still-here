import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const [input, expected] of [['', 'http://127.0.0.1:4173'], ['   ', 'http://127.0.0.1:4173'], [' https://preview.vercel.app ', 'https://preview.vercel.app']]) {
  test(`Playwright normalizes base URL ${JSON.stringify(input)}`, () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import config from './playwright.config.ts'; console.log(JSON.stringify({ base: config.use.baseURL, server: !!config.webServer }));"], { env: { ...process.env, PLAYWRIGHT_BASE_URL: input }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { base: expected, server: !input.trim() });
  });
}
