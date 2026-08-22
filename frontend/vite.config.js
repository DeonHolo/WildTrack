import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    testTimeout: 15000
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
