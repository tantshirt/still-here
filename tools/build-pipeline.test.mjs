import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = JSON.parse(await readFile('package.json', 'utf8'));
const stages = ['lint', 'build:tokens', 'build:content', 'build:data', 'typecheck', 'vite'];
for (const failure of [null, ...stages]) {
  test(`production build command ${failure ? `stops at failed ${failure}` : 'runs all stages in order'}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-pipeline-'));
    try {
      const scripts = { build: project.scripts.build };
      for (const stage of stages.slice(0, -1)) scripts[stage] = `node stage.mjs ${stage}`;
      await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts }));
      const recorder = `import { appendFileSync } from 'node:fs';\nconst stage = process.argv[2];\nappendFileSync('order.log', stage + '\\n');\nif (stage === ${JSON.stringify(failure)}) process.exit(42);\n`;
      await writeFile(join(dir, 'stage.mjs'), recorder);
      await mkdir(join(dir, 'node_modules/.bin'), { recursive: true });
      await writeFile(join(dir, 'node_modules/.bin/vite'), `#!/usr/bin/env node\n${recorder.replace('process.argv[2]', "'vite'")}`, { mode: 0o755 });
      const result = spawnSync('npm', ['run', 'build'], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status === 0, failure === null, result.stdout + result.stderr);
      const seen = (await readFile(join(dir, 'order.log'), 'utf8')).trim().split('\n');
      assert.deepEqual(seen, failure ? stages.slice(0, stages.indexOf(failure) + 1) : stages);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('content stage emits hashed reflections', () => {
  const result = spawnSync('npm', ['run', 'build:content'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /build:content — generated reflections\.[a-f0-9]{16}\.json/);
});

for (const failure of ['lint', 'tokens', 'stale-token-consumer']) {
  test(`real production build rejects invalid ${failure} input before later stages`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-real-build-'));
    try {
      await symlink(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
      for (const file of ['package.json', 'eslint.config.js', 'tools/lint', 'tools/build-tokens.mjs', 'tools/build-stage.mjs', 'tools/build-data.mjs', 'tools/build-content.mjs', 'content/reflections.json', 'content/sources.registry.json']) {
        await cp(file, join(dir, file), { recursive: true });
      }
      await mkdir(join(dir, 'src'));
      await mkdir(join(dir, 'docs'));
      await writeFile(join(dir, 'src/main.ts'), failure === 'lint' ? 'setTimeout(() => {}, 1);\n' : 'export {};\n');
      await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { skipLibCheck: true, types: [] }, include: ['src'] }));
      await writeFile(join(dir, 'docs/DESIGN.md'), 'invalid frontmatter');
      if (failure === 'stale-token-consumer') {
        await mkdir(join(dir, 'data-src'));
        await cp('data-src/WPP2024_Demographic_Indicators_Medium.csv.gz', join(dir, 'data-src/WPP2024_Demographic_Indicators_Medium.csv.gz'));
        await cp('docs/DESIGN.md', join(dir, 'docs/DESIGN.md'));
        await mkdir(join(dir, 'src/generated'));
        await writeFile(join(dir, 'src/generated/tokens.ts'), 'export const tokens = { motion: { removed: 100 } } as const;\n');
        await writeFile(join(dir, 'src/main.ts'), 'import { tokens } from "./generated/tokens"; export const value = tokens.motion.removed;\n');
        const before = spawnSync('npm', ['run', 'typecheck'], { cwd: dir, encoding: 'utf8' });
        assert.equal(before.status, 0, before.stdout + before.stderr);
      }
      const result = spawnSync('npm', ['run', 'build'], { cwd: dir, encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      const output = result.stdout + result.stderr;
      if (failure === 'stale-token-consumer') {
        assert.match(output, /Property 'removed' does not exist/);
        assert.match(output, /build:tokens — generated/);
        assert.doesNotMatch(await readFile(join(dir, 'src/generated/tokens.ts'), 'utf8'), /removed/);
      } else {
        assert.match(output, failure === 'lint' ? /no-restricted-syntax/ : /expected YAML frontmatter/);
        assert.doesNotMatch(output, /build:content —|build:data —/);
      }
      assert.doesNotMatch(output, /building client environment/);
      if (failure === 'lint') assert.doesNotMatch(output, /> node tools\/build-tokens.mjs/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('standard test command includes tooling regressions after Vitest', () => {
  assert.equal(project.scripts.test, 'vitest run && npm run test:tools');
});
