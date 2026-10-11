# Forms, review and File History follow-up — 11 October 2026

This records the requests following PR95. PR95 merged as `9081daa3c3999c2c746ee7c6f8e303dedada534b`; Heroku and Vercel production deployments succeeded on 10 October. The follow-up below is implemented locally and awaits publication. No STD DOCX, PDF or ZIP was edited.

| Request | Solution and evidence |
| --- | --- |
| Scroll while dragging a question near the upper/lower border | Edge auto-scroll accelerates near the actual scroll container's boundary and keeps the insertion cue current. Drop, Escape, leaving the viewport, blur and unmount stop it. Form editor regressions include scroll/cue behavior and cancellation. |
| Repeated Drive failure paragraphs | One common explanation, with a collapsed affected-PDF list containing deliverable/student/artifact context and the saved original Drive link where known. Access restrictions and backend retrieval failures have short per-file labels; uncertain AI/provider errors remain distinct. |
| Batch repeatedly pauses on a failed PDF | A proven Drive preparation failure before an AI claim fails that item and continues other PDFs. Configuration/rate-limit failures pause. Ambiguous failures after a claim still require explicit retry; no automatic duplicate provider call. A later verified copy may use the approved intent once after a proven preclaim failure. |
| Batch panel flickers after navigation | Progress uses the existing account/role/workspace-scoped resource cache immediately and revalidates in the background. A regression holds the server read pending and asserts the first render, rather than only eventual restoration. Authorization failures clear private cached progress. |
| Rerun Document Check on an artifact | Added beside View Document Check in Review and Today's Work. It refreshes the saved report without starting AI Review. Loading and duplicate-click guards apply to the selected artifact. |
| Old PDF access alert remains after a successful check | The events API derives resolution from a later saved readable, downloadable PDF check for the exact current source URL/resource key. Exact shared URLs reuse access proof. It removes restored access alerts from the queue without writing a dismissal. Content changes remain; newer confirmed restrictions reopen; generic transient failures do not undo restoration. Today's Work refreshes saved events after a check. |
| Duplicate File History details | Removed File details and the Recorded checks heading/introductory caption. Kept entry count, latest three checks, Earlier checks disclosure and collapsed technical details. Check result retains file validation metadata. |
| Is Drive history already configured on live? | A fresh production File History refresh still returns the setup state. Public PDF checking works, but the separate revision OAuth connection fails its server configuration check. Missing owner login/consent is a different NOT_CONNECTED state. The exact missing production setting was not identifiable with the available deployment access. |
| Template Open downloads DOCX | Open now leads to an authenticated, workspace-scoped browser text preview in a new tab. The original file is a separate explicit action. Formatting can differ from Word. No automatic original-file download occurs. |
| Show expected/detected template headings | The preview shows required headings and headings matched in the template's body, using the actual Document Check comparator. The template list stays compact. Text is rendered as text, not executable HTML. |
| Actual STD headings incorrectly missing | Reproduced against the actual DOCX template and 58-page submitted PDF. TOC page references became part of the required names: Introduction 4, Test Plan 5, Test Cases 6. Context-aware TOC parsing removes page references and never counts contents entries as body evidence. All three main sections now match on pages 8, 10 and 12; 11/12 useful expected headings match overall. |
| Explain the remaining heading difference | The template says Test Results; the existing document uses A.2. Execution Summary. This is a real title difference, not proof that results are absent. Exact matching and the frozen document are preserved. |
| Keep records for future agents | This file, the heading audit, the development handoff and the active PROGRESS checkpoint document changes, tests and next actions. Durable cache and access-resolution findings are anchored to their source and regressions. |

## What each history source means

- Current Drive metadata: the file's present name, owner/editor, modified time and checksum.
- WildTrack observations: file states actually seen during its inspections, starting with the first check. This cannot recover earlier unobserved edits or provide old PDF copies.
- Google Drive revisions: retained older edits returned by Google. These may predate submission and require separate metadata consent from an eligible file owner/editor plus a configured server OAuth connection. Ordinary WildTrack sign-in does not grant this permission. Google's API can return incomplete history: [Google revision documentation](https://developers.google.com/workspace/drive/api/guides/manage-revisions).

An Outdated report remains readable but belongs to an earlier source/file state. The label itself does not run AI Review or trigger a check. A successful current Document Check refreshes it; enabled workspace monitoring can also check eligible files on its schedule.

## Verification and next actions

- Backend: 72 batch/deduplication tests; 26 heading/template tests; 39 file-check/AI-template impact tests; 40 monitor/security/resolution tests passed. Providers were mocked or disabled. The actual artifact audit used the production POI/PDFBox/comparator classes. These counts are separate suites, not live Gemini accuracy.
- Frontend: focused rerun 99/99 and the complete 638/638 suite passed. Production build passed. The drag editor's 31 tests and File History's 35 tests are included in the full suite.
- Fresh live observation: the revision connection still needs setup; existing saved STD check can read the 58-page, approximately 1.4 MB PDF. This rules out a universal 50-page rejection, not every possible cause of earlier Drive 503s.
- Local in-app preview access was rejected by the browser URL policy. No claim is made that the new UI was visually exercised there or deployed.
- Heading evidence and unchanged original hashes: [STD_HEADING_REPAIR_2026-10-11.md](STD_HEADING_REPAIR_2026-10-11.md). Full audit logs remain in the local evidence folder; no PDF/source document is republished by this change.

Next: publish the follow-up, rerun the saved STD Document Check, and confirm the main headings on live. Configure the separate revision connection before testing genuine owner/editor consent. Its deployment settings are `WILDTRACK_DRIVE_HISTORY_OAUTH_ENABLED`, client ID/secret, callback URI, return origin, token encryption key and secure cookie. Secrets belong in deployment configuration, never Git. No setting is guessed or enabled merely to hide a warning.
