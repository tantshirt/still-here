/** Shared still capture outputs (AD-13). */
export const STILL_CAPTURE_SEED = 42;

export const STILL_OUTPUTS = [
  { file: 'share.webp', width: 1200, height: 630 },
  { file: 'fallback-mobile.webp', width: 390, height: 844 },
  { file: 'fallback-desktop.webp', width: 1440, height: 900 },
];

export const STILL_QUERY = `?still&seed=${STILL_CAPTURE_SEED}`;

export const STILL_SHARE_ALT = 'Under view of a luminous slab in darkness, with figures standing along its edge.';
