# File History and Today's Work — 10 October 2026

## Verified local completion

The requested UI changes are implemented in PR95 (unmerged). The complete frontend suite passed 612/612 tests and the production build passed. The actual backend/browser form journey verified rejected type-change → removal → save without refresh, preserved original stored values and replacement persistence after reload. Adviser selection, history scope/privacy, sorting and form feedback regressions are included in that suite. Shared history access tests passed 12/12; affected browser role flows passed 23/23.

At 375 px the in-app local preview showed a 36 px search box, Newest activity selected and no page overflow. Add question focused and selected the new label. After a preview reload recovered interrupted browser input, the history showed three recent checks and expanded/collapsed older records correctly; the prepared AI scope modal showed unique and total counts separately. Screenshots are retained in STD-20261010-03 and use fixtures. Do not claim a completed live drag or hosted deployment.

Latest follow-up: the dialog now follows the artifact row’s source-URL freshness rule, with timestamp fallback only for legacy checks. Editing an unrelated answer no longer makes the same PDF look outdated. Actual outdated checks use attention styling and a refresh explanation. This is source association, not certification that mutable Drive bytes cannot change.

The former “not enabled” message came from failed delegated OAuth configuration, not missing submitter permission. It now returns NOT_CONFIGURED with connection-setup wording. NOT_CONNECTED remains the separate optional submitter consent state. Public file metadata, recorded checks and automatic workspace monitoring can work independently. Staff cannot grant another person’s Google permissions.

The additional durable AI batch implementation and its verification are recorded in AI_REVIEW_BATCH_REPAIR_2026-10-10.md. Preserve unrelated coursework and frozen validation evidence.

## Scope and starting state

We authorized P3 File History clarity and P4 Today's Work sorting in this session. Work stays on `wildtrack-dev` in the canonical checkout. Preserve unrelated dirty work, submitted course documents, frozen MVP results and existing actions/permissions. No provider calls, archive implementation or broad persistence refactor belongs to this change.

Use the requested `ui-ux-pro-max` skill, existing Manrope/Mantine typography and WildTrack colors. Keep readable text, one divider style, keyboard controls, responsive layout and text labels for status. A broad timeline search was off-topic and was discarded; relevant skill guidance covers accessible labels, color-independent meaning and stable React list identities.

## Decisions

- File History: put available owner/editor information first; show recorded check activity as a readable timeline; retain exact identifiers and original timestamps behind one technical disclosure. Keep WildTrack observations separate from Google Drive revisions. Do not imply a complete edit history, authorship or access that is unavailable.
- Students retain the existing identity redaction. Staff-only recorded observations stay hidden from students.
- Refresh and opaque Google pagination remain scoped to the exact workspace, response and artifact. Switching artifacts must reset the history page/token state and ignore late replies.
- Today's Work: retain Priority as default; add Newest activity and Oldest activity using each task's existing activity timestamp. Sort before pagination, keep undated work visible and preserve filters, counts, dismissal and actions.
- Live Admin inspection at 626px reproduced a separate toolbar defect: search wrapper height and flex-basis were both 280px in a vertical toolbar. Correct this bounded responsive layout defect alongside P4.

## Ownership and validation

Additional requests during this session: resolve the adviser group-output chooser/warning mismatch; replace Forms “Add Button” with “Add question”; provide drag/drop and newly added card feedback; prevent the field-type menu clipping; fix removal after a rejected persisted field-type change. These are bounded additions, not new grading rules or permission to alter live academic decisions.

Root owns shared File History components, their styling/tests, responsive toolbar correction, documentation and final browser/integration verification. The bounded `todays_work_sort` worker owns CommandCenterPage, WorkQueueTable and relevant sorting/tests. Workers must preserve others' edits.

After completing P4, that worker also owns FormEditorPage, isolated Forms styling and focused interaction/real-backend journey tests. The `adviser_output_warning` worker owns the adviser page, selected-output resolver/presentation and scoped tests. Backend response/schema safeguards stay intact. Exact next steps now include all these requested corrections and their final combined verification.

Before images and the mobile layout receipt are in `.scratch/ui-history-today-20261010/live-before/`. User switched the in-app browser back to Admin. Live inspection is read-only; local fixture/browser evidence must remain labeled separately.

## Checkpoint

Baseline inspected; implementation in progress. Exact next step: implement the shared history presentation and scoped pagination reset, finish the sorting control, run focused regressions and inspect the resulting desktop/mobile views in the in-app browser. Record final files, checks and any PR here before finishing. Do not silently overwrite the previously completed STD package.
