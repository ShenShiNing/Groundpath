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
      '@tests': path.resolve(__dirname, './tests'),
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
          const normalizedId = id.replaceAll('\\', '/');
          if (!normalizedId.includes('/node_modules/')) return;

          // Order matters: more specific patterns first
          if (normalizedId.includes('/node_modules/@tanstack/')) return 'tanstack';
          if (normalizedId.includes('/node_modules/@radix-ui/')) return 'radix';
          if (normalizedId.includes('/node_modules/@base-ui/')) return 'base-ui';
          if (normalizedId.includes('/node_modules/@floating-ui/')) return 'radix';
          if (
            normalizedId.includes('/node_modules/lucide-react/') ||
            normalizedId.includes('/node_modules/sonner/') ||
            normalizedId.includes('/node_modules/cmdk/')
          ) {
            return 'ui';
          }
          if (normalizedId.includes('/node_modules/pdfjs-dist/')) return 'pdfjs';

          // React core only (avoid matching packages like @base-ui/react)
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'react';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    css: true,
  },
});
