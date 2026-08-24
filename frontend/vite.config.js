import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

const localBackendOrigin = process.env.WILDTRACK_LOCAL_BACKEND_ORIGIN || 'http://127.0.0.1:8080';
const localApiProxy = {
  target: localBackendOrigin,
  changeOrigin: true,
  secure: false
};

export default defineConfig({
  publicDir: '../public',
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
    port: 5173,
    proxy: {
      '/api': localApiProxy
    }
  },
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': localApiProxy
    }
  }
});
