# Client-store migration: Tickets 01–07 verification

Updated 2026-09-07, 20:02 Asia/Singapore. Local implementation and acceptance verification are complete. Existing Tickets 01–07 are checked; 01–03 were already done and 04–07 now include evidence notes. Independent final review remains unavailable due to usage limits. This is not hosted deployment certification or an unconditional push sign-off.

## Authoritative scope

Use `.scratch/wildtrack-client-store-collapse/spec.md` and its existing `issues/01-07*.md`. Supporting context is `architecture-review-2026-09-05T02-19-02-270Z.html` in the same folder. The older production identity specification is not this effort's ticket source. This effort has no Ticket 08.

This continuation completed 04–07 and repaired regressions found when verifying the complete migration, including session/form/student scope boundaries from 01–03. Durable checkpoints and resume instructions live in `.scratch/wildtrack-client-store-collapse/PROGRESS.md`.

## What belongs to this migration

| Ticket | Actual requirement | Implementation/evidence |
| --- | --- | --- |
| 01 | Server session and workspace scope | WorkspaceSession, authorized catalog, account/workspace stale-result guards |
| 02 | Forms and deliverables | SubmissionClient, server-backed form/template mutations |
| 03 | Public drafts and submissions | SubmissionClient, server draft/response restore, real browser save/reload |
| 04 | Review desk | ReviewDeskClient, authoritative feedback/acceptance, document-check outcomes and local errors, scoped review/adviser pages |
| 05 | Monitoring and tracker | Monitoring/workspace clients, current backend values, guarded refresh and writes |
| 06 | Remaining staff/workspace surfaces | Archive, adviser, staff and workspace clients; scoped errors and persisted records |
| 07 | Remove legacy mirror | No production workflow provider/domain storage; pure helpers separated from development CSV import |

## Necessary regression repairs

- Current-version archive status is returned within the authorized monitoring scope; historical archives no longer block archival of an edited response.
- Visible pages refresh on focus/visibility and every 15 seconds, rejecting stale workspace/account reads and pre-mutation results.
- Empty successful HTTP bodies are treated as absent resources. Previously an empty owned-response lookup prevented saved drafts from restoring.
- An absent document-check resource returns 404 rather than aborting the review load with 400.
- Linked review drawers open when asynchronous server data arrives.
- Rejected adviser feedback preserves the typed note; review decisions, staff mutations and document checks expose errors.
- Scope changes invalidate late import summaries and review/adviser batch callbacks. Individual checks show pending state.
- Staff-list errors have explicit loading/error/retry states. Late results from staff access, archive, command center, forms, student associations and workspace creation are discarded across scope changes; remaining batch requests stop after the caller leaves its scope.
- Submitted deliverable metadata remains available after unpublishing, without exposing unrelated unpublished forms.
- Unused CSV/network import code is separated into a development-only module; production formatting helpers no longer import seed data.

## Extra backend work preserved separately

The earlier continuation also added V16 audit/outbox recording, canonical-selection integration, strict response revision checks, semantic no-op handling and a composed student-dashboard API. These are not the definitions of Tickets 04–06. They are preserved under the user's subsequent instruction; this continuation does not add an outbox worker, provider integration or database redesign.

Keep the client migration and required regression repairs together. Treat V16/audit/outbox/canonical changes as a distinct review/deployment concern when organizing commits; no staging or commit rearrangement has been performed here.

Compatibility: deploy a matching backend and frontend. New clients require the monitoring/archive/dashboard contracts; older tabs that omit an existing response revision receive 409 and must reload. V15/V16 migrations and the new endpoints must be present before new clients are served.

## Fresh verification

| Check | Result |
| --- | --- |
| Full backend suite | 138 passed, 0 failures/errors/skips; all 35 report files updated 13:39–13:41 |
| Frontend suite | 226 passed, 0 failures/skips; frontend-tests-final.json saved 13:41:26 |
| Final batch cancellation client/page tests | 42 passed after the last batch wiring change; batch-tests-final.json. These mostly overlap the full suite and add one new client test; do not sum them as 268 unique tests. |
| Real browser → HTTP → database → cleared-storage reload | 2 journeys passed at 13:33: student draft/submission, staff feedback/accept/archive, tracker configuration and staff records |
| Mocked role-flow browser suite | 11 passed again at final closeout; not real persistence evidence |
| Production build/preview suite | Build and all 3 preview/proxy tests passed after final fixes; only the existing large-chunk warning remains |
| Diff whitespace and removed-symbol checks | Staged and unstaged diff checks pass; production legacy workflow symbols absent; pure helpers have no network/storage/seed references |
| Independent standards/spec review | Both final reviewer agents stopped at account usage limits; no independent approval claimed. Local fallback review below. |

Backend command (from `backend/`):

```text
rtk proxy mvn -q '-DargLine=-Djdk.net.unixdomain.tmpdir=target/browser-journey-no-unix-sockets' test
rtk proxy mvn -q '-Dtest=BrowserPersistenceJourneyIT' '-DargLine=-Djdk.net.unixdomain.tmpdir=target/browser-journey-no-unix-sockets' test
```

The JVM argument works around this machine's Java 22 Windows Unix-domain selector failure by using the JDK's TCP fallback. It changes only the test process, not production security/configuration. BrowserPersistenceJourneyIT starts Spring Boot on a random port with isolated H2, seeds real session cookies and fixture records, and runs Playwright through Vite's same-origin proxy. Application API requests are not intercepted. Node dependencies and Playwright Chromium must be installed.

Frontend commands (from `frontend/`; run the browser suites sequentially because they share port 4173):

```text
rtk proxy npm test -- --maxWorkers=1
rtk proxy npm run test:browser -- --workers=2
rtk proxy npm run test:browser:deployment -- --workers=2
```

## Boundaries of the evidence

Local persistence evidence is not hosted operational readiness. Google OAuth handoff is fixture-seeded in the real-browser test; live OAuth, Sheets/Drive credentials, Gemini, external writeback/retry workers and archive PDF storage are not certified. Sheets remains authoritative for imported tracker values; the tests do not prove live Sheets sync. Archive records preserve metadata/source links, not independent PDF bytes.

No staging, commit, push or deployment was performed. The original 73-file staged snapshot is unchanged; completion fixes and new test files remain unstaged/untracked. Committing only that old staged snapshot would omit required fixes. Ticket checkboxes reflect local acceptance evidence, not independent review approval.

## Standards

Local fallback review of the staged and unstaged changes against HEAD `de58840b18bff7990334437fe98cfcab15942af9`; independent final reviews were unavailable. No hard documented-standard violation identified in the reviewed changes. One non-blocking judgement call: possible Duplicated Code in `reviewDeskClient.js` and `monitoringClient.js`, which hydrate the same response/review/check fields. A later shared read adapter can consolidate that without reviving a global store. The test/build checks above passed.

## Spec

The implementation follows the selected client-store-collapse direction, with shared scoped resources and narrow clients replacing the workflow mirror. The prior spec review's import-scope, batch-scope and single-check feedback findings were reproduced and repaired. Additional local review found the related staff/archive/command/forms/student callbacks and unpublished-submission metadata gaps documented above. V16 audit/outbox/canonical features remain extra scope, preserved by later user instruction rather than presented as ticket requirements. Provider-backed AI success is unavailable by the existing product contract; tests assert the honest unavailable outcome, not fabricated AI results.

## Cleanup and handoff order

1. Keep the migration, privacy filtering, post-commit check scheduling and required regression fixes together; review the complete working tree, not only the old staged snapshot.
2. When organizing commits, distinguish V16/audit/outbox/canonical work and deploy its matching backend/schema contracts deliberately. Do not remove it piecemeal: response/review services now call those components transactionally.
3. Obtain an independent final review when usage permits. This report records local review, not a substitute claim of independent approval.
4. Before hosted rollout, verify real provider credentials and database migrations. Monitoring/review currently fan out to per-response HTTP reads; large-class network/server load has not been benchmarked. The 318-row UI tests establish layout, not throughput. None of these checks installs an outbox worker or proves live Sheets writeback.

Local review summary: Standards — 1 non-blocking duplication concern, 0 hard violations identified. Spec — 0 remaining local migration blockers identified, 1 preserved extra-scope feature group requiring separate review/deployment treatment. Independent final review is still outstanding.
