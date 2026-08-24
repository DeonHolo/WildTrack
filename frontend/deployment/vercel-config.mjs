function fail(message) {
  throw new Error(`Invalid WILDTRACK_BACKEND_ORIGIN: ${message}`);
}

export function normalizeBackendOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    fail('set it to the HTTPS origin of the Heroku backend for this Vercel environment');
  }

  let target;
  try {
    target = new URL(value.trim());
  } catch {
    fail('it must be an absolute HTTPS origin');
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(target.hostname.toLowerCase());
  const exactOrigin = (target.pathname === '/' || target.pathname === '')
    && !target.search
    && !target.hash
    && !target.username
    && !target.password;

  if (target.protocol !== 'https:' || localHost || target.hostname.includes('*') || !exactOrigin) {
    fail('it must be an exact, non-local HTTPS origin');
  }

  return target.origin;
}

export function createVercelConfig(environment = process.env) {
  const backendOrigin = normalizeBackendOrigin(environment.WILDTRACK_BACKEND_ORIGIN);

  return {
    framework: 'vite',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    rewrites: [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`
      },
      {
        source: '/(.*)',
        destination: '/index.html'
      }
    ]
  };
}
