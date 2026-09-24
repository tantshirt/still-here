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
  searchEmpty: 'No places found. Try another name.',
  ratesUnavailable: 'Rates for this place and year are unavailable.',
  audioUnavailable: 'Sound is unavailable. You can keep watching.',
  yearInvalid: 'Choose a whole year from 1950 to 2100.',
  controls: 'controls',
  controlsHeading: 'Controls',
  close: 'Close',
  aboutThisPiece: 'About this piece',
  yourCountry: 'Your country',
  captionWorldNow: 'THE WORLD · NOW',
  captionStillHere: 'STILL HERE',
  shareStillAlt: 'Under view of a luminous slab in darkness, with figures standing along its edge.',
  fieldPlace: 'Place',
  fieldWhen: 'When',
  fieldShow: 'Show',
  fieldSpeed: 'Speed',
  fieldCamera: 'Camera',
  whenNow: 'Now',
} as const;

export const colophonCopy = {
  paragraphs: [
    'Annual totals from UN World Population Prospects 2024, Medium variant, are spread evenly into modeled arrivals and departures for the chosen place and year. Future years from 2024 onward are projections.',
    'The standing crowd is representative density, not a census. When arrivals outnumber departures, growth shows through cadence alone.',
    'Every figure, life and written word in this piece is fictional. You are not watching real individual births or deaths.',
    'Opening quotation: Marcus Aurelius, Meditations.',
    'Population data: UN DESA, World Population Prospects 2024, Medium variant, under Creative Commons Attribution 3.0 IGO.',
  ],
  unDataLabel: 'UN World Population Prospects',
  unDataUrl: 'https://population.un.org/wpp/',
  licenceLabel: 'CC BY 3.0 IGO licence',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/igo/',
} as const;

export const showLabels = {
  both: 'Both',
  arrivals: 'Born',
  departures: 'Gone',
} as const;

export const speedLabels = {
  0.25: 'Slow 0.25×',
  1: 'Real-time 1×',
  4: 'Fast 4×',
} as const;

export const cameraLabels = {
  under: 'Under',
  level: 'Level',
  above: 'Above',
} as const;
