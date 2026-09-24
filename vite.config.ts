import { defineConfig } from 'vite';
import { resolveSiteUrl } from './tools/site-url.mjs';
const siteUrl = resolveSiteUrl(process.env);
export default defineConfig({
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  plugins: [{ name: 'site-url', transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'canonical', href: siteUrl }, injectTo: 'head' }] }],
  build: { rollupOptions: { input: { site: 'index.html', renderSpike: 'tools/render-spike/index.html' } } },
  server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
});
