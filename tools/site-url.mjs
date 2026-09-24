import { URL } from 'node:url';

export const DEFAULT_SITE_URL = 'https://still-here-one-eosin.vercel.app';

/** Build metadata only. No visitor-time configuration or network access. */
export function resolveSiteUrl(env = {}) {
  const host = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  const input = env.SITE_URL ?? (host ? `https://${host}` : DEFAULT_SITE_URL);
  let url;
  try { url = new URL(input); } catch { throw new Error('SITE_URL must be an absolute HTTP(S) origin'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SITE_URL must be an absolute HTTP(S) origin without credentials, path, query or fragment');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('SITE_URL requires HTTPS outside localhost');
  }
  return url.origin;
}
