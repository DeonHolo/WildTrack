import { describe, expect, it } from 'vitest';
import { createVercelConfig } from './vercel-config.mjs';

describe('Vercel delivery configuration', () => {
  it('fails clearly when no backend target is configured', () => {
    expect(() => createVercelConfig({})).toThrow(/WILDTRACK_BACKEND_ORIGIN/);
  });

  it.each([
    'http://wildtrack-backend.example',
    'https://localhost:8080',
    'https://wildtrack-backend.example/path',
    'https://*.example.com'
  ])('rejects an unsafe backend target: %s', (target) => {
    expect(() => createVercelConfig({ WILDTRACK_BACKEND_ORIGIN: target })).toThrow(/HTTPS origin/);
  });

  it('routes API traffic before the SPA fallback and keeps the API path intact', () => {
    const config = createVercelConfig({
      WILDTRACK_BACKEND_ORIGIN: 'https://wildtrack-backend.example'
    });

    expect(config).toMatchObject({
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist'
    });
    expect(config.rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://wildtrack-backend.example/api/:path*'
      },
      {
        source: '/(.*)',
        destination: '/index.html'
      }
    ]);
  });
});
