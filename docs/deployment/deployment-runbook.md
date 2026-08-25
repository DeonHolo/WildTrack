# Deployment and rollback runbook

Ordered, secret-free handoff for connecting Heroku, Vercel, Name.com, and Google Identity. Every step that changes external state, may cost money, or needs the project owner's account is marked **[owner action]**.

## 0. Prerequisites

- Repository on GitHub with `main` passing all checks.
- Heroku account, Vercel account, Name.com account, and Google Cloud project — **[owner action]** (account creation and billing enrollment are external).
- Read `.env.production.example` first: it lists every variable and where it belongs.

## 1. Heroku backend

1. **[owner action]** `heroku apps:create <backend-app>` (app creation is free; the dyno below is paid).
2. **[owner action]** Attach managed PostgreSQL: `heroku addons:create heroku-postgresql:essential-0 --app <backend-app>`. This provisions `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` automatically and incurs the plan cost.
3. Set production variables from `.env.production.example`:
   - `CAPVAULT_CORS_ALLOWED_ORIGINS=https://wildtrack.dev`
   - `WILDTRACK_GOOGLE_CLIENT_ID=<real client id>` (after step 4)
   - `WILDTRACK_STAFF_BOOTSTRAP_ASSIGNMENTS=ADMIN:<owner google email>`
   - `SPRING_DATASOURCE_*` are set by the add-on; do not override.
4. **[owner action]** Enable the always-on runtime: `heroku ps:type basic --app <backend-app>` (paid, ~$7/mo). An always-on dyno is required — a sleeping/free runtime does not provide reliable classroom testing.
5. Deploy: connect the GitHub repo to the Heroku app and enable deploys from `main`, or `git push heroku main`. The official Java buildpack builds from the root `pom.xml` and starts via the root `Procfile`.
6. Verify: `heroku logs --tail --app <backend-app>` shows Flyway migrations completing, then `curl https://<backend-app>.herokuapp.com/api/health/ready` returns `{"status":"UP","database":"UP"}`.

## 2. Google Identity

1. **[owner action]** In Google Cloud Console → APIs & Services → Credentials, create an OAuth 2.0 Web client (free).
2. **Authorized JavaScript origin:** exactly `https://wildtrack.dev`. Do not add localhost here — localhost belongs only to the separate development configuration in `application-local.yml`.
3. Copy the client ID into `WILDTRACK_GOOGLE_CLIENT_ID` on Heroku, then restart: `heroku ps:restart --app <backend-app>`.

## 3. Vercel frontend

1. **[owner action]** Import the GitHub repo into Vercel (hobby plan is free). Set **Root Directory** to `frontend`.
2. Set the Production environment variable `WILDTRACK_BACKEND_ORIGIN=https://<backend-app>.herokuapp.com`. Leave Preview unset so preview builds fail safely instead of silently touching production data.
3. Deploy. Verify the deployment URL loads the app and `/api/health/live` proxies through it.

## 4. Domain (wildtrack.dev at Name.com)

1. **[owner action]** In Vercel → Project → Settings → Domains, add `wildtrack.dev` and `www.wildtrack.dev`.
2. **[owner action]** At Name.com, create exactly the DNS records Vercel displays (an A record for the apex and a CNAME for `www`). Do not invent records.
3. Wait for Vercel to show **Valid Configuration** and the TLS certificate as issued before telling anyone the URL. Pilot access starts only after HTTPS validates.

## 5. Monitoring and backup

1. Configure the readiness monitor per `docs/deployment/operations-runbook.md` (5-minute interval, alerts to the named operator).
2. **[owner action]** Enable Heroku Postgres backup retention on the plan, then `heroku pg:backups:capture` once and confirm it appears in `heroku pg:backups`.

## 6. Acceptance checks (post-deployment checklist)

- [ ] `https://wildtrack.dev` serves over TLS with a valid certificate.
- [ ] Google sign-in works on the canonical origin and is rejected on any other origin.
- [ ] The bootstrap admin email from `WILDTRACK_STAFF_BOOTSTRAP_ASSIGNMENTS` receives ADMIN on first sign-in; there is no public role chooser.
- [ ] `https://wildtrack.dev/api/health/ready` returns UP through the Vercel proxy.
- [ ] A student submission round-trip succeeds end-to-end.
- [ ] The readiness monitor alerts the operator when the backend is stopped.
- [ ] `heroku pg:backups` shows a completed backup.
- [ ] A restore rehearsal into a scratch app passes the verification queries in the runbook.
- [ ] `heroku release:rollback` to the previous release returns readiness to 200, then roll forward again.

## 7. Rollback

- **Code/config rollback:** `heroku release:rollback v<N>` — safe, database untouched.
- **Database rollback:** never for code problems; only for data loss, via `pg:backups:restore` into a scratch app first. Irreversible migrations require forward recovery (new migration), not rollback.
- **Frontend rollback:** Vercel → Deployments → previous deployment → **Promote to Production**.

## 8. Deferred integrations

Gemini/AI review, Google Sheet writeback, and independent archive delivery remain disabled until their complete persistent production paths are configured and verified. Do not enable them by adding credentials alone; each needs its own verified ticket first.
