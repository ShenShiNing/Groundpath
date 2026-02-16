/// <reference types="vitest/config" />
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    // Exclude pdfjs-dist from optimization to avoid version conflicts
    exclude: ['pdfjs-dist'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Order matters: more specific patterns first
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('lucide-react') || id.includes('sonner') || id.includes('cmdk')) {
            return 'ui';
          }
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('@uiw') || id.includes('rehype') || id.includes('remark')) {
            return 'md-editor';
          }

          // React core (react, react-dom, scheduler) — after specific UI libs
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    css: true,
  },
});
