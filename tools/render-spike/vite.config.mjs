// Isolated build for the Story 2.2 render spike. Never part of the production `dist/` bundle.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(root, 'public'),
  build: { outDir: resolve(root, 'dist-spike'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1024 },
  server: { host: '127.0.0.1', fs: { allow: [root] } },
  preview: { host: '127.0.0.1' },
});
