import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const approved = await readFile('docs/DESIGN.md', 'utf8');
const cli = resolve('tools/build-tokens.mjs');
async function fixture(markdown, check) {
  const dir = await mkdtemp(join(tmpdir(), 'still-here-tokens-'));
  try {
    const input = join(dir, 'DESIGN.md');
    await writeFile(input, markdown);
    const run = () => spawnSync(process.execPath, [cli, input, join(dir, 'generated')], { encoding: 'utf8' });
    await check(run, dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('approved CLI output is complete, typed, deterministic and resolves scalar/object references', async () => {
  await fixture(approved, async (run, dir) => {
    assert.equal(run().status, 0);
    const css = await readFile(join(dir, 'generated/tokens.css'), 'utf8');
    const ts = await readFile(join(dir, 'generated/tokens.ts'), 'utf8');
    assert.match(ts, /as const;/);
    const tokens = JSON.parse(ts.match(/export const tokens = ([\s\S]+) as const;/)[1]);
    for (const group of ['colors', 'typography', 'spacing', 'layout', 'motion', 'render', 'rounded', 'components']) assert.ok(tokens[group]);
    assert.equal(tokens.layout.breakpoint, '768px');
    assert.match(css, /--layout-breakpoint: 768px;/);
    assert.match(css, /--typography-body-font-size: 1rem;/);
    assert.match(css, /--spacing-5: 1.5rem;/);
    assert.match(css, /--rounded-default: 4px;/);
    assert.match(css, /--components-threshold-paragraph-gap: 1.5rem;/);
    assert.match(css, /--components-enter-typography-font-size: 0.75rem;/);
    assert.deepEqual(tokens.components.enter.typography, tokens.typography.action);
    assert.equal(tokens.components.threshold.background, tokens.colors.background);
    for (const [key, value] of Object.entries({ 'birth-light': 600, 'birth-step': 800, 'birth-settle': 1000, 'death-extinguish': 200, 'death-fall': 1600, 'death-dissolve': 600, event: 2400 })) {
      assert.equal(tokens.motion[key], value);
      assert.ok(css.includes(`--motion-${key}: ${value}ms;`));
    }
    for (const easing of ['cubic-bezier(0.23, 1, 0.32, 1)', 'cubic-bezier(0.55, 0, 1, 0.45)']) {
      assert.ok(css.includes(easing)); assert.ok(ts.includes(easing));
    }
    assert.equal(run().status, 0);
    assert.equal(await readFile(join(dir, 'generated/tokens.css'), 'utf8'), css);
    assert.equal(await readFile(join(dir, 'generated/tokens.ts'), 'utf8'), ts);
  });
});

test('CLI follows chained references', async () => {
  await fixture(approved.replace("background: '#000000'", "background: '{colors.surface}'"), async (run, dir) => {
    assert.equal(run().status, 0);
    assert.match(await readFile(join(dir, 'generated/tokens.css'), 'utf8'), /--components-threshold-background: #101010;/);
  });
});

test('CLI preserves a token named origin without treating its group as a scalar', async () => {
  await fixture(approved.replace('colors:\n', "colors:\n  origin: '#123456'\n"), async (run, dir) => {
    assert.equal(run().status, 0);
    const css = await readFile(join(dir, 'generated/tokens.css'), 'utf8');
    assert.match(css, /--colors-origin: #123456;/);
    assert.doesNotMatch(css, /undefined/);
    const ts = await readFile(join(dir, 'generated/tokens.ts'), 'utf8');
    assert.match(ts, /"origin": "#123456"/);
  });
});

for (const [name, markdown, diagnostic] of [
  ['empty token object', approved.replace('fontSize: 16px', 'fontSize: {}'), /Empty token object at typography.body.fontSize/],
  ['missing frontmatter', 'no frontmatter', /frontmatter/],
  ['malformed YAML', '---\ncolors: [\n---\n', /DESIGN.md/],
  ['missing mandatory group', approved.replace('motion:\n', 'other-motion:\n'), /required group motion/],
  ['missing reference', approved.replace('{colors.background}', '{colors.absent}'), /Missing token reference colors.absent from components.threshold.background/],
  ['cyclic reference', approved.replace("background: '#000000'", "background: '{colors.background}'"), /Cyclic token reference.*colors.background/],
  ['object cycle', approved.replace("'{typography.action}'", "'{components.enter}'"), /Cyclic token reference/],
  ['duplicate keys', approved.replace('colors:\n', 'colors: {}\ncolors:\n'), /unique/],
  ['non-finite scalar', approved.replace('ui: 200ms', 'ui: .inf'), /Non-finite token value at motion.ui/],
  ['custom YAML tag', approved.replace('ui: 200ms', 'ui: !custom 200ms'), /Unresolved tag/],
  ['invalid motion duration', approved.replace('ui: 200ms', 'ui: banana'), /Invalid motion duration at motion.ui/],
  ['unitless motion duration', approved.replace('ui: 200ms', 'ui: 200'), /Invalid motion duration at motion.ui/],
  ['invalid motion easing', approved.replace('cubic-bezier(0.23, 1, 0.32, 1)', 'banana'), /Invalid motion easing at motion.ease-out/],
  ['invalid easing x coordinate', approved.replace('cubic-bezier(0.23, 1, 0.32, 1)', 'cubic-bezier(2, 1, 0.32, 1)'), /Invalid motion easing at motion.ease-out/],
  ['malformed typography pixels', approved.replace('fontSize: 16px', 'fontSize: ..px'), /Invalid pixel value at typography.body.fontSize/],
]) {
  test(`CLI rejects ${name} without writing output`, async () => {
    await fixture(markdown, async (run, dir) => {
      const result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, diagnostic);
      await assert.rejects(readFile(join(dir, 'generated/tokens.ts')), { code: 'ENOENT' });
    });
  });
}


test('CLI preserves __proto__ tokens as own runtime properties', async () => {
  await fixture(approved.replace('colors:\n', "colors:\n  __proto__: '#123456'\n"), async (run, dir) => {
    assert.equal(run().status, 0);
    const css = await readFile(join(dir, 'generated/tokens.css'), 'utf8');
    assert.match(css, /--colors-__proto__: #123456;/);
    const runtime = spawnSync(process.execPath, ['--input-type=module', '-e', `import { tokens } from ${JSON.stringify(join(dir, 'generated/tokens.ts'))}; if (!Object.hasOwn(tokens.colors, '__proto__') || tokens.colors.__proto__ !== '#123456') process.exit(1);`], { encoding: 'utf8' });
    assert.equal(runtime.status, 0, runtime.stdout + runtime.stderr);
  });
});
