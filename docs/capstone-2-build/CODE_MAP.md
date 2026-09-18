# Code map and verification entry points

Inspected 2026-09-19; paths are navigation hints, not immutable contracts. Read current code before edits. Active app is frontend/ and backend/, not legacy/.

## Editor and public form

- frontend/src/app/App.jsx: routes, existing /forms and /w/:workspaceKey/submit/:slug.
- frontend/src/pages/FormsPage.jsx: load/edit/save deliverables, stable slug.
- frontend/src/components/forms/FormEditorModal.jsx: existing modal, current controls and types.
- frontend/src/lib/forms.js: draft defaults and field conversion.
- frontend/src/lib/workspaceAdminClient.js: publishSuggestedForms import/suggestion integration.
- frontend/src/pages/WorkspacePage.jsx: generateSuggestedForms and source import UI.
- backend/src/main/java/com/capvault/backend/deliverable/DeliverableService.java: IDs/keys, field retirement and policy validation.
- backend/.../deliverable/DeliverableField.java and DeliverableFieldType.java: persisted schema; current types GENERAL_URL, DRIVE_PDF, GOOGLE_FORM, GOOGLE_SHEET, DRIVE_FOLDER, TEXTAREA.
- frontend/src/pages/PublicSubmissionPage.jsx and components/submission/ (locate actual identity component): respondent rendering and submission.
- backend/.../response/FormResponseService.java: field validation, JSON values, unchanged-save no-op, response versions.

## Academic data / identity / history

- backend/.../sheets/SheetImportService.java: source classification, import reconciliation and deadlines.
- backend/.../tracker/TrackerController.java: existing column edits; no complete manual student-row editing API observed.
- backend/.../student/StudentAssociationService.java: currently competing associations/conflicts, not exclusive global first-claim lock.
- frontend/src/components/command/IdentityConflictDesk.jsx and pages/CommandCenterPage.jsx: current account-conflict/history UI.
- frontend/src/lib/backendDomain.js and workflow.js: original submittedAt-based lateness at inspection.
- backend/.../drive/GoogleDriveApiGateway.java: API-key metadata requests; no revision/editor retrieval.
- backend/.../filecheck/TemplateComparator.java and FileCheckService.java: deterministic token/heading comparison and technical checks.
- backend/.../aireview/AiReviewService.java and GeminiAiReviewProvider.java: advisory, PDF-only and provenance contracts.
- backend/.../archive/ArchiveService.java: snapshots/history; metadata records alone do not prove stored PDF recovery.

## Existing tests

Frontend: FormsPage, WorkspacePage, PublicSubmissionPage, StudentStatusPage, AdviserViewPage, CommandCenterPage and ArchivePage tests; frontend/tests/browser/role-flows.spec.js.
Backend: DeliverableControllerTest, DeliverableServiceMultiArtifactTest, SheetImportControllerTest, StudentAssociationServiceTest, StudentIdentityConflictControllerTest, FormResponseServiceTest and Gemini/file-check tests (discover current filenames).

## Commands (verify scripts first)

From frontend:
- rtk npm run test -- src/pages/FormsPage.test.jsx src/pages/PublicSubmissionPage.test.jsx
- rtk npm run test -- src/pages/WorkspacePage.test.jsx
- rtk npm run test:browser -- tests/browser/role-flows.spec.js
- rtk npm run build
- rtk npm run test (final full suite)

From backend, after confirming Maven dependencies:
- rtk mvn -q -Dtest=DeliverableControllerTest,DeliverableServiceMultiArtifactTest test
- rtk mvn -q -Dtest=SheetImportControllerTest test
- rtk mvn test (final affected backend suite)
If reactor/dependency resolution needs root Maven, use the repo's documented build command rather than skipping tests. No standalone typecheck script was present in frontend/package.json; don't claim one ran.

Playwright config starts localhost:4173 with Vite and uses Chromium. Existing role-flow tests may mock APIs: browser success alone is not backend persistence proof. Add API/integration evidence for new field types and academic-grid writes.

Historical progress notes mention App-shell and FormsLoading failures. Reproduce and identify current baseline before labeling a failure pre-existing. No tests have been run by this planning package.

