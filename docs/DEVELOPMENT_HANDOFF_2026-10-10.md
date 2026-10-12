# Development handoff — 10 October 2026

Refreshed 11 October. Current follow-up: [Forms, review and File History record](<old documents, templates/outputs/04-Software-Test-Document/UI_REVIEW_FOLLOWUP_2026-10-11.md>).

Start here when continuing WildTrack development. Read the **latest checkpoint** in [PROGRESS.md](capstone-2-build/PROGRESS.md); older checkpoints are history and their unfinished counts are superseded.

## Workspace and completed work

- Canonical checkout: `D:/SchoolStuff/College Stuff/3rd Year College BSIT/Second Semester/IT332 (Capstone)/CapVaultV2`. The older `goal3-initial-record-audit` worktree is not our development checkout.
- Continue on `wildtrack-dev`. PR96 merged as `233ec86099505c6bdf30e3789a2f59be65c5c993`; PR97 merged as `c15da2da4dab9efd7fb85d8f31c906cce135a45d`. Both have successful Heroku/Vercel production deployments. Post-deployment Markdown records are on this branch. Preserve the unrelated dirty coursework/study files.
- PR92 fixed keyboard dismissal of overlapping review panels. PR93 fixed saved form question ordering. Both passed checks, were merged with authorization and deployed. Preserve their regressions.
- The temporary Validation Study area was removed. Its evidence is retained; do not restore the area or restart the completed MVP study.
- Shared AI Review readability, grouping and evidence presentation are implemented. Preserve the existing report lifecycle, dated historical results, role permissions and bounded provider requests. Docling/Instructor remain pilots, not deployed replacements.
- SRS, SDD, SPMP and STD outputs are under `docs/old documents, templates/outputs/`. The STD DOCX/PDF/ZIP is now frozen; record new changes/tests as Markdown in its folder. Do not run old builders or export scripts over it.
- The historical STD technical baseline is **50/50 PASS**. The current local PDF has 58 pages; its real extraction audit is in [the heading repair record](<old documents, templates/outputs/04-Software-Test-Document/STD_HEADING_REPAIR_2026-10-11.md>). Controlled tests do not establish fresh Gemini accuracy or hosted PostgreSQL recovery.

## Next application work

The bounded backlog is [REFACTOR_SCOPE_2026-10-09.md](REFACTOR_SCOPE_2026-10-09.md). It is not a mandate to rewrite working features.

1. Test genuine eligible Drive-history consent. Live now recognizes the server configuration and displays the optional Allow Drive history prompt, but the STD file has no eligible submitter grant yet. Four user OAuth scopes are required: openid, userinfo.email, userinfo.profile and drive.metadata.readonly. Optional Sheets writeback uses a separate service account. Do not regenerate a valid encryption key or assume any staff owner's grant qualifies as an active submitter grant; see [the setup guide](<old documents, templates/outputs/04-Software-Test-Document/DRIVE_HISTORY_SETUP_2026-10-11.md>).
2. Reproduce any remaining specific Drive download failure using safe stage/status diagnostics. The fresh live 58-page STD check reads the PDF and detects 11/12 headings, including all three main sections. Keep the real Test Results versus Execution Summary title difference. This does not identify every historical 503 cause.
3. Preserve first-render progress caching in `useAiReviewBatch`. Tests must assert the panel while its latest server read is pending, account/workspace/role isolation, and clearing after authorization denial. An eventual wait-for restoration assertion misses flicker.

## Coursework follow-up, separate from development

The STD records our Student satisfaction verdict as **Satisfactory**. Three acceptance records still need completion: the original controlled Student submission/edit trial, current adviser-flow feedback and current admin-flow feedback. Earlier accepted MVP feedback retains its original date and scope. These missing records do not prevent us from continuing bounded application development.

Follow [the course flow](it411_capstone_2_midterm_flow.md) for usability/acceptance logs. Record follow-up evidence as Markdown while the STD is frozen. Do not rerun frozen MVP scores or regenerate the STD using the initial all-NOT-RUN builders.

## Permanent archive

Read [ARCHIVE_PLAN_2026-10-09.md](ARCHIVE_PLAN_2026-10-09.md) before implementation. Our existing archive retains accepted-response metadata and source links; it does **not** preserve permanent copies of remote PDFs.

Agreed direction: final approved PDFs per team, Sir Ralph/department custody, original submitted URLs retained and duplicate detection based on file content. The measured compression pilot is in `docs/archive-storage-pilot/README.md`. Department storage allocation, Shared Drive availability and authorized write access remain unresolved before production activation. Permanent-copy archiving is a separate proposed work item, not an implemented feature or an implicit rewrite of submitted documents.

## Resume safely

- Follow root `AGENTS.md`, `CONTEXT.md` and relevant domain records.
- Preserve the dirty checkout, unrelated study files, DOCX outputs and local test sources. Do not reset, clean, stash, switch branches or bulk-commit the workspace.
- Capture a narrow reproducer, make the reviewed change and run relevant tests. Real role acceptance journeys use the production frontend preview; DEV mode deliberately substitutes preview roles.
- Keep fixture/provider simulations, actual live observations and beneficiary opinions distinct. Preserve evidence and record unresolved limits honestly.
- Update this handoff and the latest PROGRESS checkpoint after each meaningful milestone, including the exact next unfinished step.
