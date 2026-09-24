import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import architecture from './tools/lint/architecture.mjs';
import { colorRestriction, domGlobals, productionRestrictions, randomnessRestriction } from './tools/lint/restrictions.mjs';

const tests = ['**/*.test.ts', '**/*.spec.ts'];
const sourceMetadata = { regex: '(^|/)content/sources\\.json([?#].*)?$', message: 'Reflection source metadata must never enter runtime source (AD-11).' };
const otherLayers = layer => ({ regex: `(^|/)(?:${['render', 'audio', 'ui'].filter(value => value !== layer).join('|')})(?:/|$)`, message: 'Views must not import each other; main owns their wiring (AD-21).' });

export default tseslint.config(
  { ignores: ['dist/**', 'dist-spike/**', 'node_modules/**', 'art/**', '_bmad*/**', '.*/*', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: { console: 'readonly', process: 'readonly', structuredClone: 'readonly', TextEncoder: 'readonly' } } },
  {
    files: ['tools/render-spike/**/*.js'],
    languageOptions: { globals: Object.fromEntries(['window', 'document', 'location', 'navigator', 'performance', 'fetch', 'crypto', 'URLSearchParams', 'TextDecoder', 'WebGL2RenderingContext', 'requestAnimationFrame', 'addEventListener', 'innerWidth', 'innerHeight', 'devicePixelRatio'].map(name => [name, 'readonly'])) },
  },
  {
    files: ['src/render/{vat-core,vat-gpu,haze-pass}.ts'],
    rules: { '@typescript-eslint/ban-ts-comment': 'off' },
  },
  {
    files: ['src/**/*.{ts,js}'], ignores: tests, plugins: { architecture },
    rules: { 'no-restricted-imports': ['error', { patterns: [sourceMetadata] }], 'architecture/import-boundaries': 'error' },
  },
  {
    files: ['src/**/*.{ts,js}'], ignores: [...tests, 'src/generated/**'],
    rules: { 'no-restricted-syntax': ['error', ...productionRestrictions], 'architecture/asserted-literals': 'error' },
  },
  ...['render', 'audio', 'ui'].map(layer => ({
    files: [`src/${layer}/**/*.{ts,js}`], ignores: tests,
    rules: { 'no-restricted-imports': ['error', { patterns: [sourceMetadata, otherLayers(layer)] }] },
  })),
  {
    files: ['src/{sim,render}/**/*.{ts,js}'], ignores: tests,
    rules: { 'no-restricted-syntax': ['error', ...productionRestrictions, randomnessRestriction] },
  },
  {
    files: ['src/sim/**/*.{ts,js}'], ignores: tests,
    rules: {
      'no-restricted-imports': ['error', { patterns: [sourceMetadata, { regex: '^(?!\\.|/?src/sim(?:/|$)|/?src/generated/tokens(?:\\.ts)?$|@/sim(?:/|$)|@/generated/tokens(?:\\.ts)?$)', message: 'Simulation may import only itself and generated tokens (AD-21).' }, { regex: '(^|/)(app|render|audio|ui|input|data)(/|$)', message: 'Simulation may not depend on application or view layers (AD-21).' }] }],
      'no-restricted-globals': ['error', { globals: domGlobals.map(name => ({ name, message: 'Simulation must remain independent of DOM and browser APIs (AD-21).' })), checkGlobalObject: true }],
    },
  },
  {
    files: ['src/**/*.{css,glsl}'], ignores: ['src/generated/**'],
    plugins: { architecture }, processor: 'architecture/authored-text',
    rules: { 'no-restricted-syntax': ['error', colorRestriction] },
  },
);
