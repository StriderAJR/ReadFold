import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  base: '/ReadFold/',
  plugins: [react(), tailwindcss()],
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
