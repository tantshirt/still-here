import path from 'node:path';

const viewLayers = new Set(['render', 'audio', 'ui']);
function targetPath(specifier, filename, cwd) {
  const value = specifier.split(/[?#]/u)[0];
  if (value.startsWith('.')) return path.resolve(path.dirname(filename), value);
  if (/^\/?(?:src|content)\//u.test(value)) return path.join(cwd, value);
  if (value.startsWith('@/')) return path.join(cwd, 'src', value.slice(2));
  return null;
}

export const importBoundaries = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}' } },
  create(context) {
    const cwd = context.cwd;
    const filename = context.filename;
    const layer = path.relative(path.join(cwd, 'src'), filename).split(path.sep)[0];
    function check(node, source) {
      if (!source || typeof source.value !== 'string') {
        context.report({ node, messageId: 'boundary', data: { reason: 'Use a static import path so architecture boundaries can be verified.' } });
        return;
      }
      const target = targetPath(source.value, filename, cwd);
      const relative = target && path.relative(cwd, target).replaceAll(path.sep, '/');
      let reason;
      if (relative === 'content/sources.json') reason = 'Reflection source metadata must never enter runtime source (AD-11).';
      if (layer === 'sim' && !(relative === 'src/sim' || relative?.startsWith('src/sim/') || /^src\/generated\/tokens(?:\.ts)?$/u.test(relative ?? ''))) {
        reason = 'Simulation may import only simulation modules and generated tokens (AD-21).';
      }
      const targetLayer = relative?.split('/')[1];
      if (viewLayers.has(layer) && viewLayers.has(targetLayer) && targetLayer !== layer) {
        reason = 'Render, audio and UI must not import one another; main owns their wiring (AD-21).';
      }
      if (reason) context.report({ node, messageId: 'boundary', data: { reason } });
    }
    return {
      ImportDeclaration: node => check(node, node.source),
      ExportNamedDeclaration: node => { if (node.source) check(node, node.source); },
      ExportAllDeclaration: node => check(node, node.source),
      ImportExpression: node => check(node, node.source),
      TSImportType: node => check(node, node.source),
      CallExpression: node => { if (node.callee.name === 'require') check(node, node.arguments[0]); },
    };
  },
};

// Type-only wrappers do not change a literal's runtime value.
export const assertedLiterals = {
  meta: { type: 'problem', schema: [], messages: { literal: 'Asserted color and timing literals must use generated design tokens (AD-10).' } },
  create(context) {
    const wrappers = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSNonNullExpression']);
    function check(value, timing, color) {
      if (!value || !wrappers.has(value.type)) return;
      while (wrappers.has(value.type)) value = value.expression;
      const numeric = value.type === 'Literal' && typeof value.value === 'number';
      const signed = value.type === 'UnaryExpression' && ['+', '-'].includes(value.operator) && value.argument.type === 'Literal' && typeof value.argument.value === 'number';
      if ((timing && (numeric || signed)) || (color && numeric && /^0x[0-9a-f_]+$/i.test(value.raw))) {
        context.report({ node: value, messageId: 'literal' });
      }
    }
    const name = key => key?.name ?? key?.value;
    function property(key, value) {
      check(value, /^(duration|delay|.*Ms)$/.test(name(key)), /^(.*color|emissive|specular|background)$/i.test(name(key)));
    }
    return {
      Property: node => property(node.key, node.value),
      PropertyDefinition: node => property(node.key, node.value),
      AssignmentExpression: node => { if (node.left.type === 'MemberExpression') property(node.left.property, node.right); },
      NewExpression: node => { if (name(node.callee.property ?? node.callee) === 'Color') for (const value of node.arguments) check(value, false, true); },
    };
  },
};

const blank = text => text.replace(/[^\n]/gu, ' ');

// Retain only CSS declaration values. Selectors, comments, strings and URLs are
// not authored color values; blank them without changing offsets or line breaks.
function cssDeclarationValues(text) {
  const source = text.replace(/\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/gu, blank)
    .replace(/\burl\(\s*(?:\\[\s\S]|[^)\\])*\)/giu, blank);
  const output = blank(source).split('');
  let start = 0;
  let parentheses = 0;
  let depth = 0;
  function declaration(end) {
    const segment = source.slice(start, end);
    const property = /^\s*(?:--)?[\w-]+\s*:/u.exec(segment);
    if (depth > 0 && property) {
      for (let index = start + property[0].length; index < end; index++) output[index] = source[index];
    }
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '(') parentheses++;
    if (character === ')') parentheses--;
    if (parentheses !== 0) continue;
    if (character === '{') { depth++; start = index + 1; }
    if (character === ';' || character === '}') {
      declaration(index);
      if (character === '}') depth--;
      start = index + 1;
    }
  }
  return output.join('');
}

// One synthetic statement per authored line preserves diagnostic line numbers.
export const authoredText = {
  preprocess(text, filename) {
    const uncommented = filename.endsWith('.css') ? cssDeclarationValues(text)
      : text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, blank);
    return [uncommented.split('\n').map(line => `void ${JSON.stringify(line)};`).join('\n')];
  },
  postprocess(messages) {
    return messages.flat().map(message => ({ ...message, column: 1, endColumn: undefined }));
  },
};
export default { rules: { 'import-boundaries': importBoundaries, 'asserted-literals': assertedLiterals }, processors: { 'authored-text': authoredText } };
