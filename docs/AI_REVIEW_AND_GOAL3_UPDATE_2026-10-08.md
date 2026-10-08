# AI Review repair and initial-record validation audit

Date: 2026-10-08. This update contains the shared AI Review repair and the revised temporary Validation Study page. It does not change frozen SMART Goal 1/2 study results or deploy Docling/Instructor.

## Accepted behavior

AI Review separates supported issues from items requiring verification. A TOC-only entry is distinct from body content; an uncertain heading or graphical artifact does not establish an omission. Original physical page evidence is retained. Requirement excerpts and submitted-document observations remain separate.

The server computes `ISSUES_IDENTIFIED`, `NO_ISSUES_IN_CHECKED_AREAS`, or `INCONCLUSIVE`. Unresolved verification notes prevent a clean no-issues result. Prompt identity is `wildtrack-academic-review-v17`; mismatched saved settings are historical/outdated. Opening a saved report does not make a provider request.

The shared report uses consistent findings with title, explanation, next step and collapsed evidence, followed by secondary verification, observed-check and coverage sections. Both Admin and Adviser users on the Adviser page open the same report dialog through **View AI Review**, including legacy current reports.

## Saved-result lifecycle and migration

Apply `V33__ai_review_attempt_history.sql` with normal Flyway startup. It adds nullable `latest_attempt_report_json` and `latest_attempt_completed_at`, preserving the previous substantive report. Existing completed reports are backfilled. V31 is unchanged.

A valid inconclusive attempt is persisted separately from the last substantive result. During a running or failed attempt, older results remain dated previous results. The claim-token guard still protects completion updates; repeated identical reports are not displayed twice.

Optional finding metadata is additive, with legacy JSON/constructor compatibility. The Gemini schema and parser both bound verification notes at 50; ordinary finding collections remain bounded at 8. Page/section metadata and suggested actions must survive grounding checks.

## Revised SMART Goal 3 audit

The existing Admin-only `GET /api/validation-study/evidence` adds `initialSavedRecords`; legacy response fields remain compatible for old clients but are removed from the new page and CSV.

For each student, select the earliest original saved response, using current revision 1 or historical revision-1 JSON. Use the parent response's `submittedAt`: a history row's `createdAt` is the later archival time. Resolve timestamp ties by response ID. Missing student identifiers retain separate records and remain in the denominator.

Compare stored identity with the canonical roster, workspace, deliverable, original revision, required field values and account binding. A non-null student-record reference is authoritative; a wrong reference cannot fall back to a matching student number. Student-number normalization preserves punctuation. Malformed object/array values and blank required values do not pass.

Each check reports `PASS`, `FAIL`, or `UNVERIFIED` with its reason. A contradiction fails the row; unknown evidence remains unverified. The aggregate requires at least 95% agreement and no unresolved records, otherwise it reports below target or inconclusive. No cohort size or successful score is hardcoded.

**Export initial-record CSV (Excel)** contains the scope, evaluation time, cohort rule, original save data, comparisons, checked/missing field keys and reasons. Export requires the currently selected workspace and deliverable; switching scopes clears stale evidence. Spreadsheet formula-leading values are escaped. Old T1/T2 results and their unused CSV builder are removed.

## Evidence limits

This is a read-only retrospective system audit. Current roster, field definitions and account bindings are not historical snapshots. It cannot reconstruct what a student typed before submission, what the UI displayed then, rejected attempts, consent, Drive permissions, or PDF MIME/content correctness.

The earlier local assessment used 14 response records for 13 students, original-save evidence and the researcher's explicit confirmation that all 13 matched expected details and values. Its 13/13 result remains researcher-corroborated. A fresh export from this code is additional system evidence, not a replacement for that provenance or a guaranteed passing result.

The actual Admin beneficiary is Sir Ralph. His consultation transcript is separate from the anonymous Admin-role questionnaire response. The local submission PDFs document this attribution, the retrospective scope and course requirements; raw exports and the submission package are not included in this code PR.

## Verification and next step

Main-based worktree verification passed on 2026-10-08: **181 backend tests passed, 3 skipped** across 15 suites; **155 frontend tests passed** across 10 suites; Vite production build and `git diff --check` passed. The three skips are the optional private V6/V7 fixture cases and the previously deferred instruction-only heading parser case. The tracked 43-page CapVault PDF regression ran without a skip. A fresh embedded PostgreSQL database migrated through V33 and revalidated successfully.

Backend command, from `backend`:

```powershell
rtk mvn -q "-Dtest=AiReviewGroundingPolicyTest,AiReviewTemplateCrosscheckTest,GeminiAiReviewProviderTest,AiReviewDeduplicationTest,AiReviewMetadataGroundingTest,AiReviewPdfLayoutRegressionTest,AiReviewStoreLifecycleTest,AiReviewTransportInitializationTest,PdfPageEvidenceTest,ValidationStudyControllerTest,InitialSavedRecordAuditServiceTest,SrsAuthorityBodyCrosscheckOfflineRegressionTest,SrsV4RecordedPostprocessOfflineReplayRegressionTest,StdRecordedProviderPostprocessRegressionTest,PostgresMigrationIntegrationTest" test
```

Frontend command, from `frontend`, with `VITE_GOOGLE_CLIENT_ID` empty in the test process:

```powershell
rtk npm test -- src/components/review/AiReviewReport.test.jsx src/components/review/AiReviewReportDialog.test.jsx src/components/review/AiReviewRepairAcceptance.test.jsx src/components/review/AiReviewDialog.test.jsx src/pages/AdviserViewPage.test.jsx src/pages/CommandCenterPage.test.jsx src/pages/ReviewPage.test.jsx src/pages/ValidationStudyPage.test.jsx src/lib/ValidationStudyCsv.test.js src/lib/workflow.test.js
rtk npm run build
```

Tests use synthetic documents, checked-in native PDF evidence and mocked/recorded provider responses. They do not establish fresh Gemini accuracy or hosted acceptance. Read-only reviews found no remaining P1/P2 issues within the reviewed Goal 3 and AI repair scope.

After the user merges and the normal deployment applies V33, reopen Validation Study, select the intended workspace/form, then export the new initial-record CSV. Confirm the scope, comparisons, timestamps and any FAIL/UNVERIFIED reasons before attaching it to the evidence folder. No new questionnaire or student task is required by this change.
