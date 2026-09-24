import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function lint(filename, source) {
  const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', '--stdin', '--stdin-filename', filename, '--format', 'json'], { cwd: root, input: source, encoding: 'utf8' });
  assert.notEqual(result.status, 2, result.stderr);
  return { status: result.status, messages: JSON.parse(result.stdout)[0].messages };
}
const rejected = [
  ['asserted negative timing', 'app/probe.ts', 'export const config = { duration: -1 as const };', 'architecture/asserted-literals'],
  ['nested asserted timing', 'app/probe.ts', 'export const config = { delay: (300 as const) satisfies number };', 'architecture/asserted-literals'],
  ['asserted color', 'render/probe.ts', 'export const config = { color: 0xffffff as const };', 'architecture/asserted-literals'],
  ['asserted color constructor', 'render/probe.ts', 'import { Color } from "three"; export const tint = new Color((0xffffff as const) satisfies number);', 'architecture/asserted-literals'],

  ['asserted duration literal', 'app/probe.ts', 'export const config = { delay: 300 as const };', 'no-restricted-syntax'],
  ['satisfies duration literal', 'app/probe.ts', 'export const config = { holdMs: 300 satisfies number };', 'no-restricted-syntax'],
  ['destructured wall clock', 'app/probe.ts', 'const { now } = Date; export const value = now();', 'no-restricted-syntax'],
  ['destructured qualified wall clock', 'app/probe.ts', 'const { now: clock } = globalThis.Date; export const value = clock();', 'no-restricted-syntax'],
  ['destructured random', 'sim/probe.ts', 'const { random } = Math; export const value = random();', 'no-restricted-syntax'],
  ['assigned destructured random', 'sim/probe.ts', 'let random: () => number; ({ random } = Math); export const value = random();', 'no-restricted-syntax'],
  ['sim external dependency', 'sim/probe.ts', "import 'three';", 'no-restricted-imports'],
  ['sim app dependency', 'sim/probe.ts', "export * from '../app';", 'no-restricted-imports'],
  ['sim root view dependency', 'sim/probe.ts', "import '/src/render';", 'no-restricted-imports'],
  ['sim dynamic dependency', 'sim/probe.ts', "void import('../ui');", 'architecture/import-boundaries'],
  ['sim relative escape', 'sim/probe.ts', "import '../../tools/build-tokens.mjs';", 'architecture/import-boundaries'],
  ['sim import type boundary', 'sim/probe.ts', "export type Context = import('../app/context').AppContext;", 'architecture/import-boundaries'],
  ['sim generated barrel disallowed', 'sim/probe.ts', "import '../generated';", 'architecture/import-boundaries'],
  ['cross view relative', 'ui/probe.ts', "import '../audio';", 'no-restricted-imports'],
  ['cross view root', 'audio/probe.ts', "export * from 'src/render';", 'no-restricted-imports'],
  ['cross view alias', 'render/probe.ts', "import '@/ui';", 'no-restricted-imports'],
  ['cross view dynamic normalized', 'render/probe.ts', "void import('../sim/../audio');", 'architecture/import-boundaries'],
  ['non-static dynamic path', 'ui/probe.ts', 'export const load = (path: string) => import(path);', 'architecture/import-boundaries'],
  ['metadata static', 'app/probe.ts', "import '../../content/sources.json';", 'no-restricted-imports'],
  ['metadata dynamic root query', 'app/probe.ts', "void import('/content/sources.json?raw');", 'architecture/import-boundaries'],
  ['metadata reexport', 'app/probe.ts', "export { default } from '../../content/sources.json';", 'no-restricted-imports'],
  ['sim DOM', 'sim/probe.ts', 'document.createElement("div");', 'no-restricted-globals'],
  ['sim global DOM', 'sim/probe.ts', 'globalThis.document.createElement("div");', 'no-restricted-globals'],
  ['sim browser API', 'sim/probe.ts', 'void fetch("/data.json");', 'no-restricted-globals'],
  ['raw timeout', 'app/probe.ts', 'setTimeout(() => {}, 10);', 'no-restricted-syntax'],
  ['raw interval', 'ui/probe.ts', 'setInterval(() => {}, 10);', 'no-restricted-syntax'],
  ['qualified timer', 'app/probe.ts', 'window.setTimeout(() => {}, 10);', 'no-restricted-syntax'],
  ['computed timer', 'app/probe.ts', 'globalThis["setInterval"](() => {}, 10);', 'no-restricted-syntax'],
  ['wall clock', 'app/probe.ts', 'Date.now();', 'no-restricted-syntax'],
  ['computed wall clock', 'ui/probe.ts', 'Date["now"]();', 'no-restricted-syntax'],
  ['qualified wall clock', 'ui/probe.ts', 'globalThis.Date.now();', 'no-restricted-syntax'],
  ['mixed computed wall clock', 'ui/probe.ts', 'globalThis.Date["now"]();', 'no-restricted-syntax'],
  ['mixed global wall clock', 'ui/probe.ts', 'globalThis["Date"].now();', 'no-restricted-syntax'],
  ['sim random', 'sim/probe.ts', 'Math.random();', 'no-restricted-syntax'],
  ['render computed random', 'render/probe.ts', 'Math["random"]();', 'no-restricted-syntax'],
  ['render mixed global random', 'render/probe.ts', 'globalThis["Math"].random();', 'no-restricted-syntax'],
  ['hex string', 'ui/probe.ts', 'export const color = "#F0F";', 'no-restricted-syntax'],
  ['numeric material color', 'render/probe.ts', 'export const material = { color: 0xffffff };', 'no-restricted-syntax'],
  ['numeric quoted emissive color', 'render/probe.ts', 'export const material = { "emissive": 0x000000 };', 'no-restricted-syntax'],
  ['numeric color assignment', 'render/probe.ts', 'export function change(material: { color: number }) { material.color = 0xffffff; }', 'no-restricted-syntax'],
  ['numeric Color constructor', 'render/probe.ts', 'import { Color } from "three"; export const tint = new Color(0xffffff);', 'no-restricted-syntax'],
  ['numeric THREE Color constructor', 'render/probe.ts', 'import * as THREE from "three"; export const tint = new THREE.Color(0xffffff);', 'no-restricted-syntax'],
  ['hex alpha template', 'render/probe.ts', 'export const shader = `#ffffff88`;', 'no-restricted-syntax'],
  ['rgb string', 'ui/probe.ts', 'export const color = "rgb(0, 0, 0)";', 'no-restricted-syntax'],
  ['hsl string', 'ui/probe.ts', 'export const color = "hsl(0 0% 0%)";', 'no-restricted-syntax'],
  ['duration literal', 'app/probe.ts', 'export const config = { duration: 250 };', 'no-restricted-syntax'],
  ['delay literal', 'app/probe.ts', 'export const config = { "delay": 0 };', 'no-restricted-syntax'],
  ['millisecond literal', 'ui/probe.ts', 'export const config = { holdMs: 100 };', 'no-restricted-syntax'],
  ['negative duration', 'ui/probe.ts', 'export const config = { duration: -1 };', 'no-restricted-syntax'],
  ['duration assignment', 'ui/probe.ts', 'export function change(config: { delay: number }) { config.delay = 10; }', 'no-restricted-syntax'],
  ['computed duration assignment', 'ui/probe.ts', 'export function change(config: { holdMs: number }) { config["holdMs"] = 10; }', 'no-restricted-syntax'],
  ['class duration', 'ui/probe.ts', 'export class Motion { duration = 10; }', 'no-restricted-syntax'],
  ['CSS hex', 'ui/probe.css', '.thing { color: #fff; }', 'no-restricted-syntax'],
  ['CSS rgb', 'ui/probe.css', '.thing { color: rgba(0, 0, 0, 1); }', 'no-restricted-syntax'],
  ['CSS color following URL', 'ui/probe.css', '.thing { background-image: url("https://example.com/image"); color: #fff; }', 'no-restricted-syntax'],
  ['CSS color following fragment URL', 'ui/probe.css', '#fff { background: url(#abc) #fff; }', 'no-restricted-syntax'],
  ['CSS multiline nested declaration', 'ui/probe.css', '@media (width > 10px) {\n #fff:hover {\n color:\n #fff;\n }\n}', 'no-restricted-syntax'],
  ['shader hsl', 'render/probe.glsl', 'vec3 color = hsl(0, 0, 0);', 'no-restricted-syntax'],
  ['shader hex', 'render/probe.glsl', 'vec3 color = #ffffff;', 'no-restricted-syntax'],
];
for (const [name, filename, source, rule] of rejected) {
  test(`lint CLI rejects ${name}`, () => {
    const result = lint(`src/${filename}`, source);
    assert.equal(result.status, 1, JSON.stringify(result));
    assert.ok(result.messages.some(message => message.ruleId === rule), JSON.stringify(result));
  });
}
const accepted = [
  ['simulation own barrel', 'sim/probe.ts', "export * from '.';"],
  ['simulation own barrel slash', 'sim/probe.ts', "export * from './';"],
  ['asserted token timing', 'ui/probe.ts', 'import { tokens } from "../generated/tokens"; export const config = { duration: tokens.motion.ui as number };'],

  ['simulation local dependency', 'sim/probe.ts', "export * from './types';"],
  ['simulation generated tokens', 'sim/probe.ts', "import '../generated/tokens';"],
  ['simulation rooted tokens', 'sim/probe.ts', "import '/src/generated/tokens.ts';"],
  ['view typed ports', 'ui/probe.ts', "export type { SimSnapshot } from '../sim';"],
  ['view inline import type', 'ui/probe.ts', "export type Snapshot = import('../sim/types').SimSnapshot;"],
  ['token duration', 'ui/probe.ts', 'import { tokens } from "../generated/tokens"; export const config = { duration: tokens.motion.reduced };'],
  ['unrelated numeric values', 'ui/probe.ts', 'export const config = { opacity: 0.5, count: 10 };'],
  ['hexadecimal seeds and bitmasks', 'sim/probe.ts', 'export const config = { seed: 0x6d2b79f5, mask: 0xffffff }; export const bits = 0xff & config.mask;'],
  ['token Color constructor', 'render/probe.ts', 'import { Color } from "three"; import { tokens } from "../generated/tokens"; export const tint = new Color(tokens.colors.background);'],
  ['CSS hexadecimal selector', 'ui/probe.css', '#fff, #abc:hover { color: var(--colors-text); }'],
  ['CSS URL fragments', 'ui/probe.css', '.thing { filter: url(#fff); background: url("image.svg#abc"); }'],
  ['CSS attribute and content strings', 'ui/probe.css', '[data-label="#fff"] { content: "#abc"; color: var(--colors-text); }'],
  ['CSS tokens and comment', 'ui/probe.css', '/* #fff */\n.thing { color: var(--colors-text); }'],
  ['GLSL uniform and comments', 'render/probe.glsl', '// rgb(0,0,0)\nuniform vec3 sceneColor;'],
  ['test-only harness dependency', 'sim/probe.test.ts', "import 'vitest';"],
  ['generated colors and durations', 'generated/probe.ts', 'export const tokens = { color: "#fff", duration: 100 };'],
];
for (const [name, filename, source] of accepted) {
  test(`lint CLI accepts ${name}`, () => {
    const result = lint(`src/${filename}`, source);
    assert.equal(result.status, 0, JSON.stringify(result));
  });
}

test('lint CLI preserves CSS declaration source lines', () => {
  const result = lint('src/ui/probe.css', '/* #fff\n comment */\n#fff {\n background: url("image.svg#abc");\n color: #fff;\n}');
  assert.equal(result.status, 1);
  assert.deepEqual(result.messages.map(message => message.line), [5]);
});
