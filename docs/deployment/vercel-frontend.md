# Vercel frontend delivery

WildTrack's browser app is deployed from the `frontend` directory. It calls only relative `/api` URLs. Vercel proxies those requests to the Heroku backend and serves `index.html` for application routes.

## Vercel project settings

Use these repository settings:

- Root Directory: `frontend`
- Framework Preset: Vite
- Install Command: `npm ci`
- Build Command: provided by `vercel.mjs` as `npm run build`
- Output Directory: provided by `vercel.mjs` as `dist`

Set this environment variable for each Vercel environment that is allowed to reach a backend:

```text
WILDTRACK_BACKEND_ORIGIN=https://your-heroku-app.example
```

The value must be one exact, non-local HTTPS origin with no path, query, credentials, fragment, or wildcard. A deployment fails clearly when it is absent or unsafe.

Configure the production value only for Production. Leave Preview unset to make preview builds fail safely, or give Preview a deliberately approved backend target. Do not copy the production target into Preview by default.

## Routing contract

`frontend/vercel.mjs` generates the checked-in routing configuration in this order:

1. `/api/:path*` is proxied to the matching `/api/:path*` on Heroku.
2. Every remaining route is served by `/index.html` for React Router.

The API rule must remain first. It keeps authentication cookies and CSRF requests on the public WildTrack origin. The Heroku URL remains an operational backend endpoint for health checks, not a browser-facing alternative.

## Local verification

From `frontend`:

```powershell
npm test -- --run src/lib/api.test.js deployment/vercel-config.test.js
npx playwright test tests/browser/deployment-delivery.spec.js
npm run build
```

The browser check builds the production frontend, starts a local upstream fixture, verifies direct desktop and narrow routes, and confirms that the proxy preserves the method, query string, body, cookies, CSRF header, status, response header, and `Set-Cookie`.
