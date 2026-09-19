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
- Historical Ticket 01 design at that checkpoint used Student actual-use/scenario-only routes and S5-S9 scoring. This was later superseded on 2026-09-19 when the owner reopened the research design and selected student submission transaction correctness as Objective 3.
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

## 2026-09-19 — Research redesign after owner feedback

- Re-read the September 14 consultation and current session decision history before further app work. Direct transcript evidence says SMART goals should drive framework/instrument selection, ordinary usability/SUS should not count as a primary goal, the team needs at least three SMART goals, and the consultation itself is valid beneficiary/user feedback. The transcript does not directly establish a 30-respondent requirement or approve the previous status-scenario objective.
- Audited the current student UI against the questionnaire. Student-visible features include Submitted/Accepted states, Open form/Edit response, Document Check details/explanation, adviser feedback and team progress. Student AI Review explanation and Submission/Archive History are not present as current student workflow areas.
- Owner explicitly accepted **student submission transaction correctness** as Objective 3, replacing the prior status/next-action scenario objective.
- Reworked SMART_OBJECTIVES.md so Objective 3 uses a frozen real student task with two scored transaction tasks per eligible student: initial submission and one material revision. Working primary target is STU_TXN_accuracy >= 95%; questionnaire ratings do not score the goal.
- Reworked QUESTIONNAIRE.md to remove respondent-facing internal item codes, the six-character participant code, scenario-only routing, the five-scenario quiz, scenario confidence, required "None" paragraphs, student AI Review explanation, and student submission/history options.
- Reworked SCORING_AND_CODEBOOK.md to define the Objective 3 task log, T1/T2 pass assertions, transaction denominator, repeated-task rules, internal survey variables and duplicate handling without a respondent-entered code.
- Reworked FRAMEWORK_AND_EVIDENCE_PLAN.md so controlled student task evidence, role-feedback questionnaire evidence, Document Check fixtures and AI Review fixtures are separate evidence streams.
- Updated DECISIONS.md, SESSION_SPEC.md and Ticket 01 to make the new research direction authoritative for future work.
- No app/backend/frontend implementation was changed in this research-redesign slice. No participant data, benchmark result, adviser approval or hosted Google Form publication is claimed.
- Updated PROMPTS.md after a stale-reference audit found three execution prompts that would have restored the superseded status-interpretation goal in a later session.
- Validation after the research rewrite: docs/capstone-2-build/validate-package.ps1 PASS (9 nonempty package documents, 12 structured tickets, forward-only dependencies, valid saved PNG); git diff --check PASS with only existing LF/CRLF notices; respondent-facing internal-code search returned no matches in QUESTIONNAIRE.md.
- Added create_wildtrack_mvp_evaluation.gs, a standalone Google Apps Script generator for the revised research instrument. One run creates the routed Google Form, linked response Spreadsheet, SETUP link sheet, Objective 3 Task Log, and Objective 3 Protocol sheet. The script uses the built-in Apps Script Forms/Sheets services, keeps email collection off, enables one-response-per-user by default, and guards against accidental duplicate creation with Script Properties.
- Local syntax validation: copied the .gs source to a temporary .js path and ran node --check successfully; git diff --check on the script passed. Google-hosted execution was not performed because it requires the owner's Google authorization.

## 2026-09-19 — Validation UI refinement and existing-document protocol

- Owner clarified that WildTrack student submissions are fields/links only and will never upload files. Audit confirmed no file-upload field exists in the Form editor, public SubmissionFields, or backend deliverable field types. The only actual browser file input is the separate Admin official-template upload workflow, which remains outside student submission fields.
- Student Document Check now reuses the staff DocumentCheckDialog with a student audience mode. Students can see the same core file-validation and official-template-comparison evidence, including filename/check time, Drive access, PDF type/download/size/integrity/pages/readable-text/modified metadata, template coverage and missing headings. Student mode hides Check again, AI Review and raw staff/system suggested actions, and uses student-safe explanation/limitation copy.
- Multi-artifact student PDF cards now expose View Document Check for their exact artifact report; non-PDF artifacts do not gain check controls.
- Form editor refinements: persistent side Add question action, truthful Section 1 of 1 plus Question X of Y cues, visible Undo/Redo with keyboard shortcuts, native drag reorder with arrow fallback, clickable saved Public URL, canonical academic-field ordering (Student Number, Student Name, Team Code, Section first), and removal of Retired wording/panel/count. Persisted removed fields still save internally as active=false so historical response identity is preserved.
- The editor PDF type is labeled Google Drive PDF link and new PDF instructions say to paste a Drive link. No File upload type was added.
- Research protocol was aligned to the owner's real validation plan: reuse the existing imported MVP Validation workspace; use an existing published Refactored SRS or Refactored SDD form; participants paste the Drive link to their own existing old same-deliverable PDF; keep the synthetic 25-case PDF set separate for Objective 1 technical accuracy.
- Focused frontend command from frontend: `npm run test -- src/pages/FormEditorPage.test.jsx src/lib/forms.test.js src/pages/StudentStatusPage.test.jsx src/pages/ReviewPage.test.jsx` — 4 files / 60 tests passed.
- Seeded browser command from frontend: `npm run test:browser -- tests/browser/role-flows.spec.js` — 21/21 Chromium tests passed, including editor desktop/mobile round trips.
- Real-backend command from backend: `mvn -q "-Dtest=DeliverableControllerTest,DeliverableServiceMultiArtifactTest,FormEditorPersistenceJourneyIT" test` — exit 0.
- Frontend `npm run build` — pass; existing Vite chunk-size warning only.
- No commit, push, deployment, live participant collection, production data mutation, or adviser-approval claim was performed.
- Official Templates workspace regression fixed: the six-column table now gives Actions an explicit width, keeps Open/Replace/Remove on one horizontal row, and uses compact labeled controls instead of collapsing to stacked icons. Added a Playwright regression fixture/test at 1024px.
- Latest verification after the template-table fix: `npm run test -- src/pages/WorkspacePage.test.jsx` — 26/26 passed; `npm run test:browser -- tests/browser/role-flows.spec.js` — 22/22 passed; `npm run build` — pass with only the existing Vite chunk-size warning.
- Objective 3 protocol is now frozen in working docs around **Refactored SRS** plus one required WildTrack-only field, **Validation step** = Initial submission / Revised submission. Sir Ralph's consultation transcript is treated as the primary Admin/beneficiary qualitative evidence and is not double-counted as a separate Admin respondent.

## Entry format

Date/time; ticket/slice; branch/HEAD; files/diff scope; exact command + cwd; exit code and counts; screenshots/log paths; limitation; next action.
For study/provider runs additionally record fixture/model/prompt/template versions, cache hit/fresh call, quota/error, expected labels and observed result. Never include secrets or raw private participant data in public artifacts.

## 2026-09-19 — Prompt 2 full-session start

- Owner explicitly invoked PROMPTS.md prompt 2. Current branch/HEAD at start: `wildtrack-rebrand` / `77082c9faf23f49a97e95b001d88224eeea87324`.
- `git status --short --branch` at start showed only the preserved pre-existing private/local files: modified `docs/WildTrack_MVP_Validation_Progress.md`; untracked `docs/STD TEMPLATE.pdf`, `docs/TRANSCRIPT CAPSTONE 2.md`, `docs/WildTrack_Capstone_2_Session_Answers.md`, `docs/WildTrack_Document_Validation_Test_Plan.md`.
- Re-read START_HERE.md, DECISIONS.md, PROGRESS.md, SESSION_SPEC.md, EDITOR_SPEC.md, CODE_MAP.md and Tickets 04-12 before starting. Ticket 01 and Tickets 02/03 are already complete; Ticket 12 is complete only for editor mode.
- Started independent ready slices 04 and 06 in parallel with non-overlapping ownership. No Prompt 2 tests had run at this checkpoint. No commit, push, deployment, Google mutation, participant message, paid provider call or live study collection was performed.

## 2026-09-19 — Ticket 09 local preparation

- Added `deliverables/DRIVE_HISTORY_ACCESS_PLAN.md` after checking current official Google Drive scope, OAuth, revision and role documentation.
- Decision: keep pasted links and the existing API-key Document Check path; any older-history feature remains optional delegated OAuth. `drive.file` cannot be assumed to authorize arbitrary pre-existing pasted links, while the compatible metadata-wide `drive.metadata.readonly` scope is restricted and therefore has materially higher verification/security obligations.
- The plan records eligible Drive roles, incomplete/purgeable revision-history limits, possibly omitted editor email, source labeling, minimal encrypted token handling, proposed callback/configuration shape and a deterministic mock test matrix.
- No OAuth client/secret was created, no consent screen was changed, no user was prompted, no Drive token/history was read, and no external Google mutation occurred. Ticket 09 is `prepared-local; ready-for-human authorization`; its implementation/live criteria remain intentionally open.

## 2026-09-19 — Ticket 11 local validation-artifact preparation

- Added local-only response-sheet schema, evidence-folder manifest, copy-ready invitation/setup text, consultation/requirements/ticket traceability matrix, Highlights analysis template and academic-document update register. No message was sent and no live Google Form/Sheet was changed.
- Added `deliverables/FRAMEWORK_AND_MODEL.md` and exported `deliverables/Framework_and_Model.pdf` using the existing Playwright Chromium runtime. The PDF has a `%PDF-1.4` header, 88,320 bytes, three `/Type /Page` objects and a terminating `%%EOF` marker.
- The same rendered source HTML was captured and visually inspected at `.scratch/capstone-2-session/framework-model-preview.png`. A direct headless Chrome attempt to rasterize the generated PDF produced a blank viewer screenshot, so it is recorded as a failed inspection method rather than evidence of visual PDF rendering. The generated PDF itself came from the inspected source via Chromium print-to-PDF.
- `powershell -NoProfile -File docs/capstone-2-build/validate-package.ps1` — PASS: 9 nonempty package documents, 12 structured tickets, forward-only dependency graph, valid saved reference PNG.
- `git diff --check -- docs/capstone-2-build .scratch/capstone-2-session/issues/09-drive-history.md .scratch/capstone-2-session/issues/11-validation-artifacts.md` — exit 0; only existing LF-to-CRLF notices.
- Ticket 11 is `prepared-local; real-data analysis pending`. No participant counts, benchmark pass rates, target-success claims or adviser approvals were invented.

## 2026-09-19 — Ticket 10 local deterministic STD benchmark

- Inspected the owner-supplied `docs/STD TEMPLATE.pdf` with PDFBox and rendered representative pages locally. Source authority is seven pages and contains the recorded `SchedEase` body-header residue plus the `3.3 Testing Tools and Environment` numbering quirk. SHA-256: `de2826f3164c091ac5c73ba0cb22cd043fbf649d2831c94dbbcd443425dc416d`.
- Added a frozen synthetic fixture manifest/generator and generated STD-02, STD-03, STD-05, STD-08, STD-10, STD-21 and STD-24. Exact hashes are in `benchmarks/std/fixture-hashes.sha256`; generated fixture content is explicitly synthetic and is not participant evidence.
- Reproduced and fixed two deterministic `TemplateComparator` defects: a Table-of-Contents mention could previously satisfy a missing body heading, and the source template's standalone `UNIVERSITY` line was treated as a required heading. Focused regression coverage was added.
- Latest deterministic probe is preserved in `benchmarks/std/deterministic-observations.csv`: STD-01 and STD-02 are template-only; STD-03 and STD-05 are not; STD-24 reports `Test Approach` missing despite its TOC occurrence. Other content-oriented fixtures are observations only, not falsely scored as deterministic content correctness.
- `mvn -q "-Dtest=TemplateComparatorTest,StdBenchmarkFixtureTest" test` — PASS. Surefire reports: TemplateComparatorTest 4/4; StdBenchmarkFixtureTest 1/1.
- `mvn -q "-Dtest=GeminiAiReviewProviderTest,AiReviewGroundingTest,TemplateComparatorTest,StdBenchmarkFixtureTest" test` — exit 0. The named `AiReviewGroundingTest` does not exist in the repository and therefore produced no report; do not count it. Confirmed reports from that run: GeminiAiReviewProviderTest 9/9, TemplateComparatorTest 4/4, StdBenchmarkFixtureTest 1/1.
- Compiled provider cache/prompt identity: `gemini-3.1-flash-lite:rest-pdf-v2:temperature-0.2:thinking-minimal:output-2048:f5a3b0783e06fdfbc82a6fd8445864250b003225a52ed7a7c6c195f20ea47f90`.
- Environment check found no `GEMINI_API_KEY`, `CAPVAULT_GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`. No provider request, paid fallback or retry was attempted. Fresh AI pilot count remains 0, which is an external prerequisite rather than a provider failure.
- `DETERMINISTIC_PROVISIONAL_SCORING.md` records only a narrow unreviewed engineering sanity subset: TP=3, TN=1, FP=0, FN=0 across four binary assertions, observed match 4/4. It is explicitly not a final Objective 1 validation accuracy because independent human answer-key review is still pending and the fixture set is STD-only.

## 2026-09-19 — Ticket 04 academic spreadsheet editing/paste

- Added Admin-only backend-connected academic data editing for Students, Teams/Projects and Deliverables. Existing rows carry `expectedUpdatedAt`; workspace/edited rows use pessimistic locking; duplicate identifiers and stale saves are rejected before mutation. Imported source provenance is retained and there is no Sheet writeback.
- Added spreadsheet-like frontend grids with direct cell editing, add-row support where appropriate, reordered-header TSV paste preview, Add/Update classification, local Apply/Cancel behavior and one backend save per edited grid. Horizontal containment was verified at desktop and mobile widths.
- Worker command `mvn -q "-Dtest=AcademicDataControllerTest,SheetImportControllerTest,DeliverableControllerTest" test` — PASS, 18 tests (3 academic, 9 Sheet import, 6 deliverable).
- Worker command covering backendDomain/forms/student-dashboard/monitoring academic consumers plus AcademicDataWorkspace/WorkspacePage — PASS, 5 files / 38 tests.
- Worker command `npx playwright test tests/browser/academic-grid.spec.js --project=chromium` — PASS 2/2 (1280x800 and 390x844).
- Worker `npm run build` — PASS with the pre-existing Vite >500 kB chunk warning only; Ticket 04 `git diff --check` PASS with LF/CRLF notices only.
- Root independently reran the same affected backend suite — PASS. Root's first frontend subset attempt was invoked from the repository root and failed with npm `ENOENT` because no root package.json exists; rerunning from `frontend` passed 3 files / 35 tests (`backendDomain` 3, `AcademicDataWorkspace` 6, `WorkspacePage` 26). This command-path mistake is not treated as a product failure.
- Ticket 04 is complete. Ticket 05 owns later re-import difference/conflict preview and explicit source-versus-local resolution.

## 2026-09-19 — Student multi-artifact UX and Admin Validation Study

- Student Dashboard artifact semantics now include only actual link/file-bearing fields. Academic identity and ordinary text/choice fields are excluded.
- A single true artifact keeps direct `Open file` and per-artifact `View Document Check`. Multiple true artifacts use one `View submitted artifacts` action opening a modal with per-artifact Open/Document Check controls. The old bulky standalone Submitted artifacts card was removed from `/student`; aggregate status copy now describes the artifact set rather than pretending one file represents all.
- Worker Student Dashboard command from `frontend`: `npm test -- --run src/pages/StudentStatusPage.test.jsx src/components/student/StudentDeliverableList.test.jsx` — PASS, 2 files / 32 tests. `npm run build` — PASS with the existing Vite chunk warning only.
- Added isolated Admin-only `/validation-study` view plus `GET /api/validation-study/evidence?workspaceId=&deliverableId=`. It defaults to Refactored SRS by metadata, supports other selected deliverables, returns current response/revision evidence without Google subject/email, reports counts/checks, and exports CURRENT/HISTORY evidence to CSV.
- Validation Study explicitly states that the rejected blank-link attempt and student-visible readback observation are not inferable from persisted response history and must come from the controlled task log/observation evidence.
- Worker Validation Study checks: backend 3/3 PASS; frontend focused 17/17 PASS; Vite build PASS; scoped `git diff --check` exit 0. Root frontend rerun covering ValidationStudyPage, client/CSV and App role route — 4 files / 17 tests PASS.
- Root attempted `mvn -q "-Dtest=ValidationStudyControllerTest" test` while Ticket 05 was actively mid-edit. Compilation stopped in the unfinished `SheetImportService` because `PreviewSession` had not yet been added. This is retained as a concurrent-edit integration interruption, not counted as a Validation Study test failure; rerun after Ticket 05 restores whole-backend compilation.
- After Ticket 05 and Ticket 07 restored whole-backend compilation, root reran `mvn -q "-Dtest=ValidationStudyControllerTest" test` from `backend` — exit 0. Root also independently confirmed `mvn -q -DskipTests compile` — exit 0.

## 2026-09-19 — Ticket 06 account binding final hardening

- Hardened private response/history and draft access so an Admin disconnect revokes the old account's read/edit path until explicit recovery. A brand-new unbound student can still save a draft before the first successful submission.
- Hardened the narrow simultaneous first-claim row-create race so the database uniqueness collision is translated to the domain account-binding conflict instead of surfacing as an unhandled constraint error. The H2 race test still logs the caught 23505 event.
- Root backend command from `backend`: `mvn -q "-Dtest=AccountBindingSubmissionIT,FormDraftServiceTest,FormResponseServiceTest,StudentAssociationServiceTest,StudentIdentityConflictControllerTest" test` — exit 0. Surefire totals: 52 tests, 0 failures/errors/skips.
- Root frontend command from `frontend`: `npm test -- --run src/pages/PublicSubmissionPage.test.jsx src/pages/CommandCenterPage.test.jsx src/pages/StudentStatusPage.test.jsx src/components/student/StudentDeliverableList.test.jsx src/lib/api.test.js src/lib/submissionClient.test.js` — PASS, 6 files / 120 tests.
- Independent read-only re-review: `mvn '-Dtest=AccountBindingSubmissionIT,FormDraftServiceTest,FormResponseServiceTest' test` — BUILD SUCCESS, 30/30; no remaining HIGH/MEDIUM code finding at the prior disconnect or concurrency paths.
- Added `deliverables/ACCOUNT_BINDING_MIGRATION_ROLLBACK.md` to close the review's remaining LOW documentation gap. It documents V23 forward rollout, application-only rollback, full-database restore requirements if schema rollback is unavoidable, re-forward behavior, and the explicit first-successful-submission ownership limitation.
- Ticket 06 is complete locally. The association remains a first-successful-submission account binding, not independent proof of verified student identity.

## 2026-09-19 — Ticket 05 re-import preview and local-edit reconciliation

- Re-import now uses a read-only preview before mutation, reports added/changed/missing rows and field differences, and requires explicit Source or Local resolution for conflicts.
- Apply is tied to the previewed source content and a digest of the local academic state. A changed Sheet or concurrent local edit rejects the stale preview rather than overwriting newer data.
- Reordered headers do not produce bogus differences. Original and Refactored tracker headers remain distinct. Unknown metadata is surfaced as ignored/warning material instead of silently becoming a deliverable.
- Existing historical/missing records are preserved unless an explicit source-side resolution deactivates them. Student matching remains based on stable Student Number semantics and new teams remain importable.
- Legacy direct import remains available for the first import only. Once that source has been imported, direct re-import is rejected with guidance to use preview/apply, closing the reconciliation bypass.
- Backend command: `mvn -q "-Dtest=SheetImportControllerTest,AcademicDataControllerTest,ProductionSecurityBoundaryTest" test` — PASS, 27 tests total, zero failures/errors.
- Frontend command: `npm test -- --run src/lib/workspaceAdminClient.test.js src/pages/WorkspacePage.test.jsx src/lib/api.test.js` — PASS, 48/48.
- Browser command: `npx playwright test tests/browser/role-flows.spec.js --project=chromium -g "workspace source imports fit|workspace re-import previews conflicts"` — PASS, 2/2.
- Root `npm run build` from `frontend` — PASS with the existing Vite chunk-size warning only. Scoped `git diff --check` — exit 0 with line-ending warnings only.
- No live Sheet writeback or polling was introduced.

## 2026-09-19 — Ticket 07 meaningful-change lateness

- Added one backend effective-timing computation consumed by student, Admin and adviser surfaces. Effective submission time is the latest of initial submission, last saved material artifact change and verified same-link PDF content modification.
- Material artifact fields are GENERAL_URL, DRIVE_PDF, GOOGLE_FORM, GOOGLE_SHEET and DRIVE_FOLDER. Validation Step, ordinary text/choice fields and academic identity fields do not advance lateness.
- Same-link PDF content modification contributes only when field-scoped Document Check observations on the same URL show a checksum change. Drive modifiedTime is then used as evidence time. Check execution time or modifiedTime without comparable content evidence does not count.
- Missing, malformed or insufficient Drive/content evidence is labeled explicitly instead of guessing a file edit timestamp.
- Identical resaves preserve revision, submittedAt, updatedAt and response history. Editing one artifact does not invalidate unchanged artifact reviews.
- Backend focused command covering ResponseTimingService, FormResponseService and dashboard/scope integration — PASS, 40/40.
- Frontend timing/domain/workflow command — PASS, 30/30. Role-facing Student/Admin/adviser suites — PASS, 54/54. Final timing component rerun — PASS, 3/3.
- `npm run build` — PASS with the existing Vite chunk-size warning only. `mvn -q -DskipTests compile` — exit 0. Scoped `git diff --check` — exit 0 with line-ending warnings only.
- Root separately reran the two Ticket 06 dashboard response-list seams after this wiring: ReviewFeedbackScopeControllerTest 20/20 PASS and FormResponseStaffViewControllerTest 6/6 PASS.

## 2026-09-19 — Ticket 08 observed document history and privacy closeout

- Added persisted WildTrack-observed Document Check history with source labels, first/last observation times, checksum/content identifier, Drive modified time, file identity and Google Drive provider editor metadata when available. Older Google Drive revision history remains explicitly unavailable under the current API-key connection and is not fabricated.
- Removed the earlier roster-join idea for editor identity. Staff/adviser history now displays only provider-returned email, otherwise provider display name, otherwise `Unavailable`; it does not convert a Drive identity into a student roster name or claim historical revision authorship.
- Same-source checksum changes are labeled content changes. Same-checksum changes to modified time/editor metadata remain separate metadata-only observations rather than being merged away or mislabeled as content changes.
- Drive editor email/display name is persisted in staff-side FileCheck report columns added by V24 and is not serialized into student `FileCheckResponse`. Student Dashboard timing is computed only for the signed-in student's owned responses, preventing a redacted teammate response from leaking its artifact URL through `responseTimings`.
- Focused backend command from `backend`: `mvn -q "-Dtest=ObservedFileHistoryServiceTest,GoogleDriveApiGatewayTest,FileCheckServiceTest,ReviewFeedbackScopeControllerTest,PostgresMigrationIntegrationTest" test` — exit 0.
- Focused frontend command from `frontend`: `npm test -- --run src/components/review/ReviewResponseDrawer.test.jsx src/pages/AdviserViewPage.test.jsx src/lib/monitoringClient.test.js src/pages/StudentStatusPage.test.jsx src/components/student/StudentDeliverableList.test.jsx` — exit 0; 4 discovered files / 56 tests passed. The named `monitoringClient.test.js` path is not a discovered test file and is not counted.
- Regression evidence includes a real persisted DRIVE_PDF teammate submission whose URL is absent from student dashboard JSON, plus a staff observation containing Drive editor metadata whose email/display name is absent from student JSON but present in Admin monitoring history.

## 2026-09-19 — Prompt 2 full-mode Ticket 12 integration closeout

- First broad backend attempt included 138 tests and reported one failure in `FormEditorPersistenceJourneyIT`. The product path had not failed: its nested Playwright spec called nonexistent `Page.getByDisplayValue`. After replacing that obsolete helper, the journey progressed and exposed a second stale selector that targeted the last field rather than the field whose current value was `New question`. The journey was corrected to find that exact field value, preserving current insert-below-selected behavior.
- Corrected real-backend command from `backend`: `mvn -q "-Dtest=FormEditorPersistenceJourneyIT" test` — exit 0. It exercises browser -> frontend -> real Spring HTTP/H2/Flyway -> reload/publish -> public student response persistence.
- Broad backend command excluding the separately verified real-browser journey: `mvn -q "-Dtest=DeliverableControllerTest,DeliverableServiceMultiArtifactTest,AcademicDataControllerTest,SheetImportControllerTest,ProductionSecurityBoundaryTest,AccountBindingSubmissionIT,FormDraftServiceTest,FormResponseServiceTest,StudentAssociationServiceTest,StudentIdentityConflictControllerTest,ReviewFeedbackScopeControllerTest,FormResponseStaffViewControllerTest,ResponseTimingServiceTest,ObservedFileHistoryServiceTest,GoogleDriveApiGatewayTest,FileCheckServiceTest,ValidationStudyControllerTest,TemplateComparatorTest,StdBenchmarkFixtureTest,PostgresMigrationIntegrationTest" test` — exit 0; 137 tests passed. The expected caught H2 23505 canonical-binding race log appeared and is not an unhandled failure.
- Frontend cross-ticket command from `frontend`: `npm test -- --run src/app/App.test.jsx src/lib/api.test.js src/lib/backendDomain.test.js src/lib/monitoringClient.test.js src/lib/studentDashboardClient.test.js src/lib/submissionClient.test.js src/lib/workflow.test.js src/lib/workspaceAdminClient.test.js src/lib/ValidationStudyClient.test.js src/lib/ValidationStudyCsv.test.js src/components/ResponseTimingSummary.test.jsx src/components/review/ReviewResponseDrawer.test.jsx src/components/student/StudentDeliverableList.test.jsx src/components/workspace/AcademicDataWorkspace.test.jsx src/pages/AdviserViewPage.test.jsx src/pages/CommandCenterPage.test.jsx src/pages/FormEditorPage.test.jsx src/pages/PublicSubmissionPage.test.jsx src/pages/StudentStatusPage.test.jsx src/pages/ValidationStudyPage.test.jsx src/pages/WorkspacePage.test.jsx` — exit 0; 20 files / 246 tests passed.
- First combined seeded browser run was 24/25: the only failure was `submission success stays aligned and shows the submitted Student Number` because the mock fixture still required a separate pre-submit student association. That fixture contradicted Ticket 06's final atomic first-successful-save binding contract. It was corrected to require the submitted Student Number and create the mock association only when the successful submission is accepted.
- Final browser command from `frontend`: `npx playwright test tests/browser/role-flows.spec.js tests/browser/academic-grid.spec.js --project=chromium` — exit 0; 25/25 passed across desktop/mobile student, Admin, adviser, editor, academic-grid and re-import flows.
- Whole backend compile from `backend`: `mvn -q -DskipTests compile` — exit 0.
- Production frontend build from `frontend`: `npm run build` — exit 0; Vite 6.4.3 transformed 5,413 modules, emitted `index-Db4-8a5l.js` at about 975.57 kB before gzip, and reported only the existing >500 kB chunk-size warning.
- Package validator from repository root: `powershell -NoProfile -ExecutionPolicy Bypass -File docs/capstone-2-build/validate-package.ps1` — PASS: 9 nonempty package documents, 12 structured tickets, forward-only dependency graph and valid saved PNG. Screenshot SHA256 remains `7600CA41F0AB5ADD66F27F5E06C1AAD6141BB1CFCBBB5AB9B627067643EAE591`.
- Security/correctness closeout rechecked five previously material seams: legacy direct re-import cannot bypass preview/apply after first import; disconnected accounts do not regain old response access through `/my-team`; Student Dashboard timing does not expose teammate artifact URLs; Drive editor identity is staff-only; Validation Study evidence endpoint/page remains Admin-only.
- External work remains deliberately unfinished: Ticket 09 delegated Drive revision history awaits explicit owner authorization and genuine Google access; Ticket 10 final validation awaits independent human answer-key/provider evidence; Ticket 11 empirical analysis awaits real participant/task data. No deployment, live Google mutation, participant messaging or paid/provider run occurred in this closeout.

## 2026-09-19 — Prompt 2 Git/PR publication

- Final intended stage set contained 133 public Prompt 2 files. `git diff --cached --check` passed with line-ending notices only.
- Explicit exclusion check confirmed the preserved local/private files were not staged: `docs/WildTrack_MVP_Validation_Progress.md`, `docs/STD TEMPLATE.pdf`, `docs/TRANSCRIPT CAPSTONE 2.md`, `docs/WildTrack_Capstone_2_Session_Answers.md`, and `docs/WildTrack_Document_Validation_Test_Plan.md`.
- Created commit `f1452df feat: complete capstone 2 validation hardening` on `wildtrack-rebrand`: 133 files changed, 9,584 insertions and 651 deletions.
- `git push origin wildtrack-rebrand` succeeded, advancing the remote branch from `77082c9` to `f1452df`.
- GitHub reported no existing open PR from `wildtrack-rebrand` to `main`. Opened new PR #48, `Complete Capstone 2 validation workflow hardening`: https://github.com/DeonHolo/WildTrack/pull/48.
- PR #48 is intentionally left unmerged. No direct merge to `main` and no deployment occurred.
