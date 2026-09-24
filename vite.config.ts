import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import { resolveSiteUrl } from './tools/site-url.mjs';
const STILL_SHARE_ALT = 'Under view of a luminous slab in darkness, with figures standing along its edge.';

const siteUrl = resolveSiteUrl(process.env);
const shareImage = `${siteUrl}/stills/share.webp`;

function geoDevStub(): Plugin {
  const handler: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url !== '/api/geo') return next();
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 200;
    response.end(JSON.stringify({ country: null }));
  };
  return {
    name: 'geo-dev-stub',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

function siteHead(): Plugin {
  return {
    name: 'site-head',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'canonical', href: siteUrl }, injectTo: 'head' },
      {
        tag: 'link',
        attrs: { rel: 'preload', as: 'image', href: '/stills/fallback-mobile.webp', media: '(max-width: 767px)' },
        injectTo: 'head',
      },
      {
        tag: 'link',
        attrs: { rel: 'preload', as: 'image', href: '/stills/fallback-desktop.webp', media: '(min-width: 768px)' },
        injectTo: 'head',
      },
      { tag: 'meta', attrs: { property: 'og:title', content: 'STILL HERE' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image', content: shareImage }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: STILL_SHARE_ALT }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'twitter:title', content: 'STILL HERE' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'twitter:image', content: shareImage }, injectTo: 'head' },
    ],
  };
}

export default defineConfig({
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  plugins: [geoDevStub(), siteHead()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
