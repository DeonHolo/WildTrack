# Operations runbook — Heroku + Vercel pilot

This runbook covers the operational evidence and recovery procedures for the WildTrack pilot. It assumes the deployment topology from `docs/deployment/production-smoke.md` and `docs/deployment/vercel-frontend.md`.

## Logs

### Heroku application and release logs

```powershell
heroku logs --tail --app <backend-app>
heroku logs --tail --process=web --app <backend-app>   # web dyno only
heroku releases --app <backend-app>                     # release history
heroku releases:output --app <backend-app>              # build + release output for one release
```

Every request logs one structured line:

```text
method=GET pathCategory=health status=200 durationMs=12 correlationId=<uuid>
```

The `X-Correlation-Id` response header matches `correlationId` in the log line. When reporting a problem, include the correlation id from the failing request.

### Vercel deployment logs

Open the Vercel dashboard → project → **Deployments** → select the deployment → **Build Logs** (build-time failures) or **Runtime Logs** (request-time). Runtime logs show the same correlation id header when the frontend forwards it.

### PostgreSQL resource use

```powershell
heroku pg:info --app <backend-app>          # plan, connection count, bloat, disk
heroku pg:outliers --app <backend-app>      # slowest normalized queries
heroku pg:locks --app <backend-app>         # current lock contention
```

Connection count should stay well below the plan limit; the app pool caps at 10 by default.

### Recent failed requests

Filter Heroku logs by status and correlation id:

```powershell
heroku logs --tail --app <backend-app> | findstr "status=5"
```

Error responses never include stack traces or database details; use the correlation id to find the matching server-side log entry.

## Monitoring

Configure one external monitor (for example, UptimeRobot or Heroku's own scheduler-based check):

- **URL:** `https://<backend-app>.herokuapp.com/api/health/ready`
- **Interval:** every 5 minutes
- **Alert:** any non-200 response routes to the named on-call operator (default: the repository owner)

`/api/health/live` proves the dyno is up; `/api/health/ready` additionally proves PostgreSQL is reachable. Alert on `ready`; use `live` only to distinguish a dyno crash from a database outage.

## Migrations and release ordering

Flyway runs at web-dyno startup, before the dyno accepts traffic. A failed migration crashes the new dyno, so Heroku keeps serving the previous release. To confirm:

```powershell
heroku releases --app <backend-app>          # the failed release shows as failed
heroku ps --app <backend-app>                # web dyno should be up on the last good release
heroku release:rollback v<N> --app <backend-app>   # only if the failed release also changed config
```

For schema changes that are not backward compatible, use a two-step forward migration: add the new column/table first, deploy code that uses it, then remove the old column in a later release. Never roll the database back for a code-only rollback.

## Backups and recovery

### Create and verify a backup

```powershell
heroku pg:backups:capture --app <backend-app>
heroku pg:backups --app <backend-app>       # list with retention window
heroku pg:backups:url b001 --app <backend-app>   # temporary download URL
```

Heroku retains the most recent daily backup (7 on standard plans). Capture an explicit backup before every migration-bearing release.

### Restore into an isolated environment

Restore into a scratch app, never over production:

```powershell
heroku apps:create wildtrack-restore-check
heroku addons:create heroku-postgresql:essential-0 --app wildtrack-restore-check
heroku pg:backups:restore b001 DATABASE_URL --app wildtrack-restore-check
```

### Verify representative records

Against the restored database:

```powershell
heroku pg:psql --app wildtrack-restore-check
```

```sql
SELECT count(*) FROM academic_workspaces;          -- expected: the workspace count before the backup
SELECT count(*) FROM form_responses;               -- expected: response count before the backup
SELECT id, deliverable_key, bytes_available FROM academic_document_templates LIMIT 5;  -- templates with durable bytes
SELECT count(*) FROM wildtrack_sessions WHERE revoked = FALSE;  -- active sessions survive
```

Also open the restored backend once with `WILDTRACK_*` placeholder config pointed at the restored database and confirm `/api/health/ready` returns 200.

### Rollback vs database recovery

- **Application rollback** (`heroku release:rollback`) is safe when the release contained code or config only. The database stays untouched.
- **Database recovery** (`pg:backups:restore`) is destructive and replaces all data. It is only for data loss or corruption. Migrations that already ran are part of the backup; restoring returns both schema and data to the backup moment.
- **Forward recovery** is required for irreversible migrations (column drops, data rewrites). If such a release fails after migrating, fix forward with a new migration instead of rolling back.

### Rehearsal

Before the pilot:

1. `heroku pg:backups:capture` on production.
2. Restore the backup into the scratch app and run the verification queries above.
3. Deploy a no-op config change, then `heroku release:rollback` and confirm `/api/health/ready` returns 200 on the previous release.
4. Tear down the scratch app.

Record the rehearsal date and results in the pilot checklist. The rehearsal never modifies production data.

## Recovery ownership

The repository owner is the recovery owner for the pilot. If the owner is unavailable, the course adviser decides whether to restore from backup. All recovery actions are logged in this repository's issue tracker with timestamps.
