# Evidence ledger

Append concise entries; never replace failed results with passing summaries.

## 2026-09-19 — planning only

- Read ask-matt, to-spec, to-tickets, implement, writing-for-agents, setup and handoff/questionnaire routing instructions.
- Inspected current form editor/persistence/suggestions, source-data and identity/lateness code seams.
- Read course instructions, consultation, session decisions, benchmark plan, latest progress notes.
- Official Google Forms source research completed; REFERENCES.md contains direct URLs.
- User screenshot copied from temporary attachment to durable references path.
- App code unchanged. No provider call, form publication, Sheet mutation or deployment.
- App tests NOT RUN for planning. Historical test counts in source progress notes are not this run's results.
- Read-only reviewer identified two scheduling gaps: Ticket 09 preparation was incorrectly human-blocked; Ticket 12 omitted Ticket 11 local preparation. Both corrected. Full-mode closeout now requires 09/11 preparation while distinguishing remaining external work.
- Initial inline PowerShell package check failed because nested command interpolation stripped variables. Replaced with a saved validator script. First script run reached structural checks but failed on unavailable Get-FileHash; switched hashing to .NET SHA256.
- Final command from repository root: `rtk proxy powershell -NoProfile -File docs/capstone-2-build/validate-package.ps1` — exit 0. Nine nonempty package documents, twelve structured tickets, forward-only dependency graph and valid saved PNG checked.
- Saved screenshot SHA256: `7600CA41F0AB5ADD66F27F5E06C1AAD6141BB1CFCBBB5AB9B627067643EAE591`.

## 2026-09-19 — Prompt 1 / Ticket 01 completion and editor baseline

- Branch/HEAD at resume: `wildtrack-rebrand` / `1a2f0e066a9c4278ea8d0232b4ed52398797d724`; unrelated dirty/untracked files were preserved.
- Ticket 01 produced `deliverables/SMART_OBJECTIVES.md`, `QUESTIONNAIRE.md`, `SCORING_AND_CODEBOOK.md`, and `FRAMEWORK_AND_EVIDENCE_PLAN.md`. The packet labels GQM/thresholds as proposed, keeps adviser endorsement pending, separates participant evidence from technical benchmarks, and claims no collected result.
- Branch audit passed for Student actual-use, Student scenario-only, Adviser, Admin/beneficiary, no-use, and decliner paths. Consent is isolated; no route is trapped by another role's required question. S5-S9 key is A/B/A/A/B and Objective 3 uses `ceil(0.90*N)`.
- Worker validation: `rtk proxy powershell -NoProfile -File docs/capstone-2-build/validate-package.ps1` — exit 0; custom branch/scoring/content audit — pass.
- Frontend baseline from `frontend`: `rtk npm run test -- src/pages/FormsPage.test.jsx src/pages/PublicSubmissionPage.test.jsx src/lib/forms.test.js src/app/App.test.jsx` — exit 1, 69/70 tests passed. FormsPage, PublicSubmissionPage, and forms domain tests all passed. The single failure is the existing App shell assertion at `src/app/App.test.jsx:114`, which expects visible text `Ralph Laviste`.
- Backend baseline from `backend`: `rtk mvn -q "-Dtest=DeliverableControllerTest,DeliverableServiceMultiArtifactTest,FormResponseServiceTest" test` — exit 0. The first unquoted Maven selector attempt did not start tests because PowerShell parsed the commas; the quoted rerun is the valid baseline.
- App code remained unchanged through this checkpoint. Ticket 01 was shown to the owner before application editing began.
- Next action: Ticket 02/03 implementation with separate backend and frontend writers, followed by integrated tests, browser evidence, and editor-mode Ticket 12 review.

## 2026-09-19 — Prompt 1 / Tickets 02, 03 and editor-mode 12 closeout

- Implemented a real ADMIN full-page editor at `/forms/new` and `/forms/:formId/edit`; the former modal path was removed. Save preserves lifecycle state, Publish/Unpublish is explicit, stale saves use `expectedUpdatedAt`, public slugs stay stable, failed drafts remain editable, and unsaved browser/in-app navigation is guarded.
- Added V21 configurable-question persistence: nullable field help text plus stable ordered choice-option rows. Added short answer, paragraph, dropdown, multiple choice, checkboxes and source-bound Student Number/Name/Team Code/Section alongside existing artifact-link types. Existing one-link and five-artifact behavior remains supported.
- Server-side response validation rejects unknown keys, academic fields submitted as arbitrary answers, malformed text/choice/checkbox values, duplicate checkbox selections and unknown option IDs. Existing option meaning/type is protected once responses exist; retired historical answers remain server-preserved while the client sends only active response fields.
- Student Number remains the account/roster identity anchor. Team Code and Section are roster-derived. After independent review, configured required academic fields are checked against the canonical current Student Record on both client presentation and server submission; optional/absent fields create no invented requirement. A second active Student Number anchor is blocked in the editor and by editor validation.
- PDF Document Check and AI Review remain independent per PDF field; non-PDF fields cannot enter review queues. New suggested PDF forms use the established AUTO Document Check + AI Review enabled defaults, while existing customized policies are preserved.
- Backend affected/review command from `backend`: `rtk mvn -q "-Dtest=DeliverableControllerTest,DeliverableServiceMultiArtifactTest,FormResponseServiceTest,FileCheckServiceTest,FileCheckControllerTest,AiReviewDeduplicationTest,GeminiAiReviewProviderTest,ProductionSecurityBoundaryTest" test` — exit 0 after final fixes. `ProductionSecurityBoundaryTest` also passed separately, preserving ordinary authenticated non-Admin 403 behavior for form mutations.
- Frontend affected command from `frontend`: `rtk npm run test -- src/lib/api.test.js src/lib/forms.test.js src/lib/formsClient.test.js src/lib/workflow.test.js src/lib/workspaceAdminClient.test.js src/pages/FormsLoading.test.jsx src/pages/FormsPage.test.jsx src/pages/FormEditorPage.test.jsx src/pages/PublicSubmissionPage.test.jsx` — 9 files / 105 tests passed.
- Post-review focused frontend command: `npm run test -- src/pages/FormEditorPage.test.jsx src/pages/PublicSubmissionPage.test.jsx src/lib/workflow.test.js src/lib/workspaceAdminClient.test.js` — 77/77 passed. `npm run build` passed; only the existing Vite chunk-size warning remains.
- Full frontend suite was intentionally recorded rather than summarized away. A pre-change baseline already reproduced `src/app/App.test.jsx:114` expecting `Ralph Laviste`. Post-change full-suite attempts continued to fail that same assertion. Separate full-suite attempts also exposed unrelated timing flakes in `FormsLoading.test.jsx` and `ReviewPage.test.jsx`; those suites passed immediately in isolation (`FormsLoading` 8/8, `ReviewPage` 19/19). No Prompt 1 changed those review/app-shell behaviors, so full-suite status is not claimed green.
- Seeded browser command from `frontend`: `rtk npm run test:browser -- tests/browser/role-flows.spec.js` — 21/21 Chromium tests passed after all fixes. This covers Admin, adviser and student flows plus editor desktop 1280x800/mobile 390x844, keyboard Move Up, no horizontal overflow, Save/Preview/Publish/reload, preview with no added API call, and public-form submission.
- Browser screenshots regenerated after the final browser run: `frontend/test-results/ticket12-form-editor-desktop.png` (147356 bytes) and `frontend/test-results/ticket12-form-editor-mobile.png` (108027 bytes).
- The older broad `BrowserPersistenceJourneyIT` was also run and failed in pre-existing/stale selectors outside Prompt 1: `Feedback for student` on the adviser page and the already-removed `Deliverable columns` workspace control. Those timeouts were inspected rather than labeled pre-existing from assumption.
- To provide a true Prompt 1 backend round trip, added `FormEditorPersistenceJourneyIT` plus `tests/persistence/form-editor-backend-journey.spec.js`. Command from `backend`: `rtk mvn -q "-Dtest=FormEditorPersistenceJourneyIT" test` — exit 0. Chromium edited and saved through real HTTP/Spring/H2/Flyway, cleared browser storage and reloaded persisted state, published, reloaded again, then a seeded student submitted the newly added question through the real public response endpoint and verified persisted response JSON.
- Independent read-only review initially found two medium issues (academic requiredness mismatch and duplicable Student Number anchor) plus one lower-risk suggested-PDF default inconsistency. All three were fixed. Final re-review found no material correctness, security or V21 migration issue remaining; ADMIN boundaries, stable identity/history behavior and PDF-only review isolation were confirmed.
- `git diff --check -- backend frontend` passed after final fixes, with only Git LF-to-CRLF notices. No commit, push, deployment, live Google mutation, paid AI request, participant recruitment/collection, adviser-approval claim or study-result claim was performed.
- Remaining work belongs to later package tickets or external prerequisites: spreadsheet editing/import reconciliation, cross-semester identity lifecycle, lateness/history work, optional older Drive history authorization, controlled checker benchmark execution, production deployment/OAuth, adviser endorsement where required, real participant collection and final analysis.

## Entry format

Date/time; ticket/slice; branch/HEAD; files/diff scope; exact command + cwd; exit code and counts; screenshots/log paths; limitation; next action.
For study/provider runs additionally record fixture/model/prompt/template versions, cache hit/fresh call, quota/error, expected labels and observed result. Never include secrets or raw private participant data in public artifacts.
