export const colorRestriction = {
  selector: String.raw`:matches(Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i], TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i])`,
  message: 'Authored colors must come from generated design tokens (AD-10).',
};
const propertyName = '(?:duration|delay|.*Ms)';
const numericValue = ':matches(Literal[value=type(number)], UnaryExpression[argument.type="Literal"][argument.value=type(number)], :matches(TSAsExpression, TSSatisfiesExpression, TSTypeAssertion)[expression.type="Literal"][expression.value=type(number)])';
const colorProperty = '(?:.*color|emissive|specular|background)';
const hexLiteral = 'Literal[value=type(number)][raw=/^0x[0-9a-f_]+$/i]';
const numericColorRestrictions = [
  ...['Property', 'PropertyDefinition'].flatMap(type => [
    `${type}[key.name=/^${colorProperty}$/i] > ${hexLiteral}`,
    `${type}[key.value=/^${colorProperty}$/i] > ${hexLiteral}`,
  ]),
  `AssignmentExpression[left.type="MemberExpression"][left.property.name=/^${colorProperty}$/i] > ${hexLiteral}`,
  `AssignmentExpression[left.type="MemberExpression"][left.property.value=/^${colorProperty}$/i] > ${hexLiteral}`,
  `NewExpression[callee.name="Color"] > ${hexLiteral}`,
  `NewExpression[callee.property.name="Color"] > ${hexLiteral}`,
  `NewExpression[callee.property.value="Color"] > ${hexLiteral}`,
].map(selector => ({ selector, message: 'Numeric colors must come from generated design tokens (AD-10).' }));
function destructuredBuiltin(object, property) {
  const origins = `:matches(Identifier[name="${object}"], MemberExpression[property.name="${object}"], MemberExpression[property.value="${object}"])`;
  return [
    `VariableDeclarator:has(> ${origins}.init) > ObjectPattern.id > Property:matches([key.name="${property}"], [key.value="${property}"])`,
    `AssignmentExpression:has(> ${origins}.right) > ObjectPattern.left > Property:matches([key.name="${property}"], [key.value="${property}"])`,
  ].join(', ');
}
export const productionRestrictions = [
  { selector: destructuredBuiltin('Date', 'now'), message: 'Date.now is forbidden; use the frame delta and scene clocks (AD-3).' },
  { selector: 'Identifier[name=/^(setTimeout|setInterval)$/]', message: 'Raw timers are forbidden; use named XState lifecycle delays or scene time (AD-3).' },
  { selector: 'MemberExpression[computed=true][property.value=/^(setTimeout|setInterval)$/]', message: 'Raw timers are forbidden; use named XState lifecycle delays or scene time (AD-3).' },
  {
    selector: ':matches(MemberExpression[object.name="Date"][property.name="now"], MemberExpression[object.name="Date"][property.value="now"], MemberExpression[object.property.name="Date"][property.name="now"], MemberExpression[object.property.name="Date"][property.value="now"], MemberExpression[object.property.value="Date"][property.name="now"], MemberExpression[object.property.value="Date"][property.value="now"])',
    message: 'Date.now is forbidden; use the frame delta and scene clocks (AD-3).',
  },
  colorRestriction,
  ...numericColorRestrictions,
  ...['Property', 'PropertyDefinition'].flatMap(type => [
    { selector: `${type}[key.name=/^${propertyName}$/] > ${numericValue}`, message: 'Numeric duration, delay and *Ms properties must use design tokens (AD-10).' },
    { selector: `${type}[key.value=/^${propertyName}$/] > ${numericValue}`, message: 'Numeric duration, delay and *Ms properties must use design tokens (AD-10).' },
  ]),
  { selector: `AssignmentExpression[left.type="MemberExpression"][left.property.name=/^${propertyName}$/] > ${numericValue}`, message: 'Numeric duration, delay and *Ms assignments must use design tokens (AD-10).' },
  { selector: `AssignmentExpression[left.type="MemberExpression"][left.property.value=/^${propertyName}$/] > ${numericValue}`, message: 'Numeric duration, delay and *Ms assignments must use design tokens (AD-10).' },
];
export const randomnessRestriction = {
  selector: destructuredBuiltin('Math', 'random') + ', :matches(MemberExpression[object.name="Math"][property.name="random"], MemberExpression[object.name="Math"][property.value="random"], MemberExpression[object.property.name="Math"][property.name="random"], MemberExpression[object.property.name="Math"][property.value="random"], MemberExpression[object.property.value="Math"][property.name="random"], MemberExpression[object.property.value="Math"][property.value="random"])',
  message: 'Simulation and rendering must use the seeded random streams (AD-5).',
};
export const domGlobals = ['window', 'document', 'navigator', 'location', 'screen', 'history', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'Image', 'Audio', 'AudioContext', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'Node', 'Event', 'EventTarget', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia', 'performance'];
