export const DEFAULT_SITE_URL: string;
export function resolveSiteUrl(env?: { SITE_URL?: string; VERCEL_URL?: string; VERCEL_ENV?: string; VERCEL_PROJECT_PRODUCTION_URL?: string }): string;
