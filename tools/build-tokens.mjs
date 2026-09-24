import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

const groups = ['colors', 'typography', 'spacing', 'layout', 'motion', 'render', 'rounded', 'components'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = Symbol('scalar token');
const pixelValue = /^-?(?:\d+(?:\.\d+)?|\.\d+)px$/;
const motionDuration = /^\d+(?:\.\d+)?ms$/;

function validateMotion(value, path) {
  if (path.at(-1).startsWith('ease-')) {
    const match = typeof value === 'string' && value.match(/^cubic-bezier\(\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/);
    const points = match ? match.slice(1).map(Number) : [];
    if (points.length !== 4 || !points.every(Number.isFinite) || [points[0], points[2]].some(point => point < 0 || point > 1)) {
      throw new Error(`Invalid motion easing at ${path.join('.')}: expected cubic-bezier with x coordinates in [0, 1]`);
    }
  } else if (typeof value !== 'string' || !motionDuration.test(value) || !Number.isFinite(Number.parseFloat(value))) {
    throw new Error(`Invalid motion duration at ${path.join('.')}: expected nonnegative milliseconds (for example 200ms)`);
  }
}

export function generateTokens(markdown) {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) throw new Error('DESIGN.md: expected YAML frontmatter delimited by ---');
  const document = parseDocument(frontmatter[1], { uniqueKeys: true, schema: 'core' });
  const issues = [...document.errors, ...document.warnings];
  if (issues.length) throw new Error(`DESIGN.md: ${issues.map(error => error.message).join('; ')}`);
  const source = document.toJS({ maxAliasCount: 0 });
  for (const group of groups) {
    if (!isObject(source?.[group]) || Object.keys(source[group]).length === 0) {
      throw new Error(`DESIGN.md: missing or invalid required group ${group}`);
    }
  }
  const cache = new Map();
  function resolvePath(path, trail = []) {
    if (trail.includes(path)) throw new Error(`Cyclic token reference: ${[...trail, path].join(' -> ')}`);
    if (cache.has(path)) return cache.get(path);
    const keys = path.split('.');
    if (!groups.includes(keys[0])) throw new Error(`Unknown token reference ${path} from ${trail.at(-1) ?? 'root'}`);
    let value = source;
    for (const key of keys) {
      if (!isObject(value) || !Object.hasOwn(value, key)) throw new Error(`Missing token reference ${path} from ${trail.at(-1) ?? 'root'}`);
      value = value[key];
    }
    const next = [...trail, path];
    let result;
    if (isObject(value)) {
      if (Object.keys(value).length === 0) throw new Error(`Empty token object at ${path}`);
      result = Object.fromEntries(Object.keys(value).sort().map(key => {
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error(`Invalid token key ${path}.${key}`);
        return [key, resolvePath(`${path}.${key}`, next)];
      }));
    } else if (typeof value === 'string' || typeof value === 'number') {
      const reference = typeof value === 'string' && value.match(/^\{([^{}]+)\}$/);
      if (reference) result = resolvePath(reference[1], next);
      else {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Non-finite token value at ${path}`);
        if (typeof value === 'string' && (!value.trim() || /[{};\r\n]/.test(value))) throw new Error(`Invalid value or unresolved reference at ${path}: ${value}`);
        result = { [scalar]: true, value, origin: path };
      }
    } else throw new Error(`Invalid token value at ${path}`);
    cache.set(path, result);
    return result;
  }
  const resolved = Object.fromEntries(groups.map(group => [group, resolvePath(group)]));
  const css = [];
  const names = new Set();
  function emit(node, path = []) {
    if (node[scalar]) {
      const name = path.join('-').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/-+/g, '-');
      if (names.has(name)) throw new Error(`CSS token name collision at ${path.join('.')}`);
      names.add(name);
      let cssValue = node.value;
      if (path[0] === 'motion') validateMotion(node.value, path);
      if (/^(typography|spacing)\./.test(node.origin) && /px$/.test(String(cssValue))) {
        if (!pixelValue.test(String(cssValue)) || !Number.isFinite(Number.parseFloat(cssValue))) throw new Error(`Invalid pixel value at ${node.origin}: ${cssValue}`);
        cssValue = `${Number.parseFloat(cssValue) / 16}rem`;
      }
      css.push(`  --${name}: ${cssValue};`);
      return (path[0] === 'motion' || /^motion\./.test(node.origin)) && motionDuration.test(String(node.value)) ? Number.parseFloat(node.value) : node.value;
    }
    return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, emit(child, [...path, key])]));
  }
  const tokens = emit(resolved);
  return {
    css: `/* Generated from docs/DESIGN.md. Do not edit. */\n:root {\n${css.join('\n')}\n}\n`,
    ts: `// Generated from docs/DESIGN.md. Do not edit.\nexport const tokens = ${JSON.stringify(tokens, null, 2).replace(/"__proto__":/g, '["__proto__"]:')} as const;\n\nexport type Tokens = typeof tokens;\n`,
  };
}

export async function buildTokens(input = 'docs/DESIGN.md', output = 'src/generated') {
  const result = generateTokens(await readFile(input, 'utf8'));
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'tokens.css'), result.css);
  await writeFile(join(output, 'tokens.ts'), result.ts);
  console.log(`build:tokens — generated ${output}/tokens.{css,ts}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await buildTokens(process.argv[2], process.argv[3]); }
  catch (error) { console.error(`build:tokens — ${error.message}`); process.exitCode = 1; }
}
