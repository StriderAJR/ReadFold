import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const contentRoot = resolve('.local-tools/content');

function generatedContentPlugin(): Plugin {
  return {
    name: 'readfold-generated-content',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }
        let pathname;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        } catch {
          next();
          return;
        }
        pathname = pathname.replace(/^\/ReadFold\//, '/').replace(/^\//, '');
        if (!/^(books|ja)\/[a-zA-Z0-9_./-]+\.json$/.test(pathname) || pathname.split('/').includes('..')) {
          next();
          return;
        }
        const file = resolve(contentRoot, pathname);
        if (!file.startsWith(`${contentRoot}${sep}`)) {
          next();
          return;
        }
        try {
          const body = await readFile(file);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            next();
          } else {
            next(error);
          }
        }
      });
    },
  };
}

export default defineConfig({
  base: '/ReadFold/',
  publicDir: 'dist_public',
  plugins: [react(), tailwindcss(), generatedContentPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'zustand'],
          supabase: ['@supabase/supabase-js'],
          local: ['dexie'],
          language: ['i18next', 'react-i18next'],
          validation: ['zod'],
        },
      },
    },
  },
});
