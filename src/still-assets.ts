/** Fixed session seed for share and fallback still captures (AD-13). */
export const STILL_CAPTURE_SEED = 42;

export const stillPaths = {
  share: '/stills/share.webp',
  fallbackMobile: '/stills/fallback-mobile.webp',
  fallbackDesktop: '/stills/fallback-desktop.webp',
} as const;

export const stillShareDimensions = { width: 1200, height: 630 } as const;

export const stillFallbackSizes = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

export function isStillCapture(search: string): boolean {
  return new URLSearchParams(search).has('still');
}
