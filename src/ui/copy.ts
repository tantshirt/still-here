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
  preparing: 'Preparing the scene…',
  retry: 'Retry scene',
  fallback: 'This device is showing a still of the piece. The moving scene is unavailable.',
  projection: 'Projection',
  returnToNow: 'Return to now',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  pause: 'Pause',
  resume: 'Resume',
  wordsAvailable: 'Words from an imagined life are available.',
  imaginedLife: 'An imagined life.',
  searchEmpty: 'No places match that search.',
  ratesUnavailable: 'Rates for this place and year are unavailable.',
  audioUnavailable: 'Sound is unavailable. You can keep watching.',
  yearInvalid: 'Choose a whole year from 1950 to 2100.',
  controls: 'controls',
  captionWorldNow: 'THE WORLD · NOW',
} as const;

export const showLabels = {
  both: 'Both born and gone events shown',
  arrivals: 'Born events shown',
  departures: 'Gone events shown',
} as const;

export const speedLabels = {
  0.25: 'Slow speed',
  1: 'Real-time speed',
  4: 'Fast speed',
} as const;

export const cameraLabels = {
  under: 'Under camera',
  level: 'Level camera',
  above: 'Above camera',
} as const;
