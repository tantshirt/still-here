/** Council ruling C: preserve the authored line breaks and punctuation. */
export const thresholdCopy = {
  groups: [
    ['People are arriving. People are leaving.', 'You are still here.'],
    ['You could leave life right now.'],
    ['Let that determine', 'what you do and say and think.'],
  ],
  enter: 'enter',
} as const;

export const sceneCopy = {
  label: 'World, Now',
  description: 'Modeled estimates and imagined lives.',
} as const;
