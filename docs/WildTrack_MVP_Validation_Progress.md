# WildTrack MVP Validation — Progress and Handoff Notes

Last updated: 2026-09-11

## Post-release real workspace progress - 2026-09-11

User-provided production screenshots after PR #31 and PR #32 confirm that the real IT411 validation setup has now progressed materially beyond the earlier terminal-authentication blocker. This subsection supersedes the earlier statement below that workspace creation was still blocked from the terminal. The workspace was created/configured through the authenticated production UI by the project owner; no claim is made that ChatGPT performed those authenticated browser mutations.

### Production workspace/import state visible in the UI

- A dedicated MVP-validation workspace now exists and is selected in production.
- **Important metadata discrepancy to verify before participant validation:** the production UI currently shows the workspace as **`IT411 2627 SEM2 - MVP Validation`** and the header as **`IT | IT411` / `Semester 2 | 2026-27`**. The previously approved target throughout this handoff is **`IT411 2627 SEM1 - MVP Validation`** for the current IT411 Semester 1 workflow. Do not silently assume these are equivalent. Confirm whether the production workspace was accidentally created as Semester 2; if so, correct the workspace metadata before collecting validation evidence so screenshots, forms, archives, and academic records do not carry the wrong semester.
- Workspace summary shows **3 / 3 sources imported**, **303 students**, **5 deliverables**, and **0 templates**.
- The Source Sheets panel shows all three expected sources in **Imported** state: Team Formation, Tracker, and Software Project Monitor.
- This is consistent with the intended one-time snapshot import model. The screenshots do not prove the deeper reconciliation counts by themselves, so the remaining post-import checks still need to verify **299 historical Student Number matches**, **4 genuinely new Team 65 students**, **19 historical-only inactive students**, the actual **63 current-team** result, **5 deadline suggestions**, retained old/current team mappings, and no Google writeback.

### Published deliverables visible in production

The Forms page shows exactly **5 published forms**, matching the current Tracker deliverables:

1. `MVP Validation` - due Sep 12, 2026, 11:59 PM
2. `Refactored SPMP` - due Sep 19, 2026, 11:59 PM
3. `Refactored SRS` - due Sep 19, 2026, 11:59 PM
4. `Refactored SDD` - due Sep 19, 2026, 11:59 PM
5. `STD` - due Sep 26, 2026, 11:59 PM

All five are visibly `Published`.

The Forms list currently summarizes the `MVP Validation` rule as **`PDF Drive link`** even though the public MVP Validation form shown in the second screenshot contains all five typed fields. This appears to be a legacy/summary-label UI inconsistency rather than evidence that the persisted form lost its multi-artifact configuration. Treat it as a minor display issue unless a later API/detail check shows otherwise.

### MVP Validation public form state

The production MVP Validation form visibly contains all five required submission artifacts in one form/response:

1. **Google Form - Validation Instrument** - required Google Form URL
2. **PDF - Validation Framework/Model** - required Google Drive PDF URL
3. **Google Sheet - Validation Responses** - required Google Sheet URL
4. **PDF - MVP Validation Highlights** - required Google Drive PDF URL
5. **Google Drive Folder - Validation Evidence** - required Drive-folder URL

The screenshot also demonstrates that the student/team identity area is populated independently from those artifact fields. This is the intended one-response/multi-artifact shape and is materially different from the old single-URL form model.

### Immediate next production checks

Before formal participant validation, complete these in order:

1. **Confirm/correct the SEM1 vs SEM2 workspace metadata discrepancy.** This is the highest-priority visible issue from the screenshots.
2. Verify the real import reconciliation results in WildTrack, not only the summary counters: 303 active students; 299 historical matches; 4 new students all on Team 65; 19 historical-only inactive; actual current teams = 63 if the import matches the prior dry-run; exactly 5 active Tracker deliverables; 5 deadline suggestions; historical/current team mappings retained.
3. Confirm `MVP Validation` field definitions in the admin editor/API have stable persisted IDs and the intended policies: only Framework/Model and MVP Validation Highlights are `DRIVE_PDF`, Document Check enabled, and AI Review enabled; the Form, Sheet, and folder fields must have Document Check and AI Review off.
4. Add the **two independent official templates** for the two checkable PDF artifact fields. Workspace summary currently shows **0 templates**, so template-backed Document Check is not yet ready for those two PDFs.
5. Run a safe no-writeback smoke using a test response in which the first URL is the Google Form. Confirm Document Check and AI Review target Framework/Model and Highlights explicitly and independently, never the first URL.
6. Exercise the acceptance lifecycle on that test response: accept -> archive -> revoke acceptance -> confirm current state is Pending / Not Archived while the immutable archive snapshot remains -> reaccept unchanged response and confirm the old matching snapshot can become current again without a duplicate acceptance/archive row.
7. Confirm no `/api/tracker/writebacks` action is used during the validation smoke and no automatic Google polling/re-import has been enabled.

Do not begin collecting real participant submissions until the semester metadata is confirmed and the no-writeback/multi-PDF smoke passes.

### 2026-09-11 workspace/lifecycle and usability follow-up

The project owner confirmed from the newly created production workspace that the four current students not found in the old Team Formation source are present together under new current-semester team `2627-sem1-it411-65`. This is consistent with the prior dry-run result that Team 65 is genuinely new rather than a renamed historical team. The remaining reconciliation checks still need to verify the exact historical-match/inactive/team/deadline counts from the real workspace.

The project owner prefers to create a fresh correct Semester 1 workspace after the next deployment rather than repair the existing Semester 2 test workspace in place, because recreating the workspace is also useful for re-testing the Tracker import/form-suggestion workflow from a clean setup. No participant/public links have been distributed from the incorrect Semester 2 workspace, so there is currently no link-compatibility obligation for that test workspace.

Approved follow-up engineering work before recreating the validation workspace:

- Add Admin **Edit workspace** UX for name, program, course code, semester, and academic year using the existing workspace update API.
- Add **Archive workspace** and **Restore workspace** lifecycle controls backed by the existing `active` flag. Archiving must preserve imported data, forms, submissions, reviews, and history. Do not add ordinary permanent deletion in this batch.
- Hide archived workspaces from normal student workspace choices while retaining an Admin management surface for restoring them.
- Preserve the existing student behavior for a single available workspace: it is selected automatically and no workspace-choice dropdown is required.
- In the form editor, newly created Google Drive PDF fields should default to AI Review enabled, and the checkbox label should be shortened from `Allow Admin AI Review` to `Allow AI Review`. Existing saved field settings must remain unchanged when editing.
- Refactor the login artwork/banner to reuse the same proven banner/artwork implementation used by the deliverable/student surfaces rather than maintaining separate mascot-sizing markup/CSS. The current mobile login screenshot shows the mascot rendered materially too small.

Implementation and release-gate verification for this follow-up is now complete locally:

- Workspace administration now supports editing workspace name/program/course/semester/year, soft-archiving with `active=false`, and restoring an archived workspace. There is intentionally no hard-delete action or endpoint in this batch.
- Normal `GET /api/workspaces` catalogs return active workspaces only. Admin may explicitly request the archived management catalog; archived workspaces therefore do not create false student workspace choices or remain available through normal public workspace resolution.
- Workspace updates now perform the same friendly program/course/semester/year duplicate-identity check used during creation before the database uniqueness constraint is reached.
- The existing one-workspace student behavior is preserved and regression-tested: the sole active workspace is auto-selected/persisted, `needsWorkspaceChoice=false`, and the student UI does not render a redundant chooser.
- The form editor label is now `Allow AI Review`. Changing a non-PDF field to Google Drive PDF defaults AI Review on. A saved PDF field that was deliberately configured with AI Review off remains off when reopened/edited.
- The login page now renders its hero through the same `FormArtwork` component used by the public deliverable form. Login-only banner grid/mascot-offset CSS was removed, and the login artwork uses the same full-height `auto 100%` sizing strategy as the submission artwork.
- Focused combined frontend verification for WorkspaceSession, WorkspacePage, FormsPage, and RegisterPage: **45 / 45 passed**. The broader worker verification covering Forms, Login, WorkspaceSession, Public Submission, and Student Status: **92 / 92 passed**.
- Workspace backend lifecycle/duplicate validation test: **3 / 3 passed**.
- Full backend Maven suite after the combined changes: **181 / 181 passed**, 0 failures/errors/skips.
- Full frontend Vitest after the combined changes: **279 / 281 passed**. The only two failures remain the same pre-existing unrelated test debt: the unchanged App-shell `Ralph Laviste` assertion and the unchanged Forms-loading 60-second cache-expiry assertion. Neither failing test file is modified by this follow-up.
- Final frontend production build passed with 5402 modules transformed; only the existing >500 kB Vite chunk-size warning remains.
- Packaged production verification passed: `HerokuBuildpackContractTest` **1 / 1** and `PackagedProductionSmokeIT` **1 / 1**, Maven `BUILD SUCCESS`.
- Final pre-release `git diff --check` is clean. A source search confirms no workspace hard-delete implementation was added and no new Tracker/Google writeback call path was introduced.

This follow-up was released to production on 2026-09-11:

- Release commit: `fb1ff2a` (`feat: improve workspace administration and validation UX`).
- PR: **#34**, `Improve workspace administration and validation UX`.
- Merge commit on `main`: `81abeb3e5b611578f0da3efc5174d56ad45f480c`.
- Vercel reported the exact merge-commit deployment **successful**.
- Post-merge `https://www.wildtrack.dev/api/health/ready` returned HTTP 200 with `service=wildtrack-backend`, `status=UP`, and `database=UP`.
- `origin/wildtrack-rebrand` remains retained.

Next production action is intentionally a fresh-workspace exercise performed through the authenticated Admin UI: create the correctly labeled **`IT411 2627 SEM1 - MVP Validation`** workspace, then manually import Team Formation -> Software Project Monitor -> current IT411 Tracker in that approved precedence order. Use the fresh import to re-verify the five Tracker deadline/form suggestions before generating forms. After the correct Semester 1 workspace has been checked, the mistaken Semester 2 test workspace can be soft-archived through the new lifecycle UI rather than deleted. No participant links depend on the mistaken workspace.

## Latest engineering status - 2026-09-11 multi-artifact implementation

The approved MVP Validation engineering batch is now in final verification. This section supersedes the older notes below that describe multi-artifact support or Revoke Acceptance as only planned/unresolved.

### V20 multi-artifact submission model

- Added persistent per-deliverable field definitions with stable identity, label, type, requiredness, display order, Document Check policy, AI Review eligibility, and active/retired state.
- The intended `MVP Validation` deliverable can therefore contain five independently typed fields in one response: `Validation Instrument` (Google Form), `Framework / Model` (Google Drive PDF), `Validation Response Sheet` (Google Sheet), `MVP Validation Highlights` (Google Drive PDF), and `Validation Evidence` (Google Drive folder).
- Legacy one-link and one-PDF deliverables retain compatibility through migrated/default field behavior. Fieldless legacy PDF checks remain response-level instead of writing a synthetic field ID that has no persisted V20 row.
- Server and frontend validation distinguish Google Form, Google Sheet, Drive folder, Drive PDF, generic URL, and text semantics. A non-PDF first URL is not used as the PDF merely because of object order.

### Independent PDF review state

- Framework / Model and MVP Validation Highlights can carry separate official-template associations.
- Document Check requests/reports carry artifact-field identity and are aggregated only for response-level status displays.
- AI Review linkage/cache state is artifact-specific, allowing the two PDFs in the same response to have separate saved reviews and retry/currentness state.
- Admin official-template UI now selects a specific checkable PDF artifact and shows both deliverable and artifact in the template table. Replacement preserves the existing artifact mapping.
- Explicit field template lookup no longer silently falls back to a deliverable-level legacy template, preventing one PDF from accidentally borrowing another artifact's comparison template.
- Review and Adviser UI keep one response/group output while exposing artifact-specific PDF actions inside the detail UI. Today's Work remains response-oriented with aggregate PDF context.
- Student Status shows all submitted artifacts for multi-part responses rather than presenting one arbitrary first link as the whole submission.

### Revoke Acceptance and archive semantics

- Revoke Acceptance is available even after an accepted response has an archive snapshot.
- Archive snapshots remain immutable history. Revoking does not delete or rewrite the historical archive record.
- A response is currently `Archived` only when a matching current-version archive snapshot exists and an active acceptance also exists for that exact response version.
- Revoking clears the current acceptance and immediately returns the frontend state to `Not Archived`; reload derives the same result from the backend.
- Re-accepting an unchanged response reactivates the existing acceptance row and allows the existing matching archive snapshot to count again instead of creating a duplicate archive version.
- New archive records snapshot the complete labeled artifact set while retaining the old single `source_link` column for backward compatibility with historical rows.

### Verification recorded so far

- Frontend Adviser + Student Status focused tests: **44 / 44 passed**, including a five-artifact response whose first URL is a Google Form while Document Check targets the later Highlights PDF explicitly.
- Frontend multi-artifact-focused verification passed, including **118 / 118** tests in the main affected suites and **9 / 9** Archive page tests. The final production build also passed after the late Adviser first-link cleanup; Vite transformed 5402 modules with only the existing >500 kB chunk-size warning.
- The final full frontend Vitest run completed at **272 / 274 passed**. The two remaining failures are pre-existing/unrelated branch test debt: an unchanged App-shell test still expects `Ralph Laviste`, and an unchanged Forms-loading cache-expiry test still expects retained forms to disappear after 60 seconds. The only multi-artifact `FormsPage.jsx` delta in that path preserves `fields` in editable form state and does not alter cache expiry behavior.
- Backend focused multi-artifact/revoke suite passed after compatibility fixes, including real PostgreSQL Flyway migration through **V20**, five-field deliverable CRUD, typed response validation, two independent AI PDF reviews, revoke/re-accept/archive-currentness behavior, and legacy compatibility paths.
- Full backend Maven verification is green: **177 / 177 tests passed** with 0 failures, 0 errors, and 0 skipped.
- The documented packaged production smoke command passed: `HerokuBuildpackContractTest` **1 / 1** and `PackagedProductionSmokeIT` **1 / 1**, with Maven `BUILD SUCCESS`.
- The documented root `mvn -DskipTests clean install` reactor build also passed after the smoke verification.
- Archive API test separately passed with all five typed artifact references captured in one immutable archive response snapshot.
- Final working-tree `git diff --check` is clean. No operational frontend use of `firstSubmissionLink` remains, and the writeback audit still finds no normal frontend caller of `writeTrackerValue()`.

### Release gate

Release completed through production on 2026-09-11:

- V20 batch commit: `78eae62` (`feat: support multi-artifact validation submissions`).
- PR: **#31**, `Support multi-artifact validation submissions`.
- Merge commit on `main`: `fa8198128434ed34fd7bc860980204ba9d5aad78`.
- Vercel reported the merge-commit deployment successful.
- Post-merge `https://www.wildtrack.dev/api/health/ready` returned HTTP 200 with backend and database `UP`.
- A live anonymous read of the existing `week-9-srs` public form returned the new persisted V20 `fields` array, including the migrated legacy `DRIVE_PDF` field ID. This confirms the deployed backend is running the V20 code/schema rather than merely returning the old health response.
- Remote `wildtrack-rebrand` was retained.
- No live Google mutation was performed.

The next approved step, creating/importing `IT411 2627 SEM1 - MVP Validation`, is currently blocked by production authentication in this terminal environment. `GET /api/auth/session` is anonymous here and `GET /api/workspaces` returns HTTP 401. Workspace creation and Sheet import are authenticated session-cookie + CSRF operations; the available terminal does not possess an authorized WildTrack session and browser cookie/secret scraping is intentionally prohibited. Do not fabricate workspace creation. Once an authorized production app session is available through a supported tool, continue with Team Formation -> Software Project Monitor -> current Tracker, then configure the exact five fields and run the no-writeback smoke.

Security follow-up discovered during that auth-path audit was hardened and released after the first V20 release. Central Spring Security method/path rules now require ADMIN for workspace create/update, Sheet import, deliverable create/update, workspace-source update, template save/from-Drive/delete, and tracker writeback. Direct FileCheck APIs now require ADMIN or ADVISER so an ordinary authenticated student cannot invoke staff Document Check reads/writes. Tracker-column mutation and other existing controller-level staff/admin checks remain unchanged. Focused authorization/controller verification is **33 / 33 passed**, the final full backend suite is **179 / 179 passed**, and the packaged production smoke is green. Security follow-up commit `edb017c` was merged in PR **#32** as `9ce53ce951c3fdc92bf68fa78713f3191fdbe26c`; Vercel reported the merge-commit deployment successful and post-merge production readiness remained HTTP 200 with backend/database `UP`.


## Latest authoritative engineering status - 2026-09-10 evening

This section supersedes any older compatibility/gap notes later in this file that describe the semester-aware importer as unfinished or recommend automatic Sheet polling during MVP validation. Those older sections are preserved only as audit history.

### Semester-aware importer and source authority

The importer/reconciliation work required for the current IT411 semester is implemented and locally verified.

- The **current IT411 Tracker is authoritative** for current team code, section, MID/member number, adviser, software title, current deliverables, deadlines, and active/current roster state.
- **Team Formation** and **Software Project Monitor** remain historical/supporting Capstone 1 sources. Their original team/group codes are preserved instead of being rewritten to current-semester codes.
- Cross-semester identity is reconciled primarily by **Student Number**, not by matching the numeric suffix of a team code.
- Tracker context can promote the current operational team code while preserving the historical Team Formation code and old SPM project-source code.
- Current Tracker rows determine the active/current roster. Students present only in old Team Formation data remain historical/inactive after the current Tracker snapshot is imported.
- `MID` is recognized as member number. `No.` and `SOFTWARE TITLE` are metadata, not deliverables.
- Current deliverables are exactly: `MVP Validation`, `Refactored SPMP`, `Refactored SRS`, `Refactored SDD`, and `STD`.
- Original and refactored artifacts remain distinct deliverables. There is no automatic destructive rename inference such as `SRS -> Refactored SRS`.
- Removed Tracker columns are retained as historical/inactive context on later manual imports rather than being hard-deleted.
- Unknown headers are not automatically trusted as deliverables merely because they exist.

### Live-source reconciliation evidence

The previously inspected live/published sources produced these reconciliation counts:

- old Team Formation students with Student Number: **318**
- current IT411 Tracker students with Student Number: **303**
- current Tracker students matched to old Team Formation by Student Number: **299 / 303**
- unmatched current students: **4**, all belonging to `2627-sem1-it411-65`
- current teams with matched historical membership: **62**
- ambiguous current-team to old-team mappings among those 62: **0**

Team 65 is therefore treated as a genuinely new current-semester team. The expected current workspace should contain about **63 current teams**, but the exact team count must still be verified after the real import rather than assumed from the prior comparison.

### Parallel-play and Google Sheet safety

MVP validation remains deliberate **parallel play** with Sir Ralph's real Google Forms/Sheets workflow.

- Import the three academic sources once as a deliberate reference snapshot.
- Do **not** poll or automatically re-import Sir's Sheets during the MVP validation period.
- The 15-second frontend resource refresh, where present, refreshes WildTrack backend state only and is not Google Sheet polling.
- Test submissions, reviews, acceptance/revoke actions, Document Check, AI Review, and ordinary tracker UI flows do **not** automatically invoke Google Sheet writeback.
- Audit on 2026-09-10 found `writeTrackerValue()` only as an unused frontend API wrapper. There are no frontend callers.
- The only backend call to `GoogleSheetsGateway.updateSingleCell(...)` is inside `TrackerWritebackService`, and it runs only when the explicit `/api/tracker/writebacks` request sets `writeToGoogleSheet=true`.
- Therefore the normal validation UI is non-writeback. The explicit writeback endpoint must not be used during validation. The deployment runbook already classifies Google Sheet writeback as a deferred integration.

### Verification completed after frontend test cleanup

The missing `StaffIdentity` test mock was the cause of the Adviser page tests remaining on `Loading data`. The test harness was updated to provide the production identity shape without changing Adviser production UI. Two stale Student Status expectations were also updated to match the current ResourceBoundary/workspace-cache behavior.

Verified results:

- `AdviserViewPage.test.jsx`: **13 / 13 passed**
- targeted stale `StudentStatusPage.test.jsx` cases: **2 / 2 passed**
- full `StudentStatusPage.test.jsx`: **28 / 28 passed**
- `workflow.test.js`: **13 / 13 passed**
- `TrackerPage.test.jsx`: **3 / 3 passed**
- `WorkspacePage.test.jsx`: **20 / 20 passed**
- frontend production build: **passed**, Vite 6.4.3, 5402 modules transformed; only the existing >500 kB chunk-size warning remains
- backend `SheetImportControllerTest`: **7 / 7 passed**, Maven reactor **BUILD SUCCESS**

Known unrelated test debt remains in `ReviewPage.test.jsx`: **13 / 17 passed, 4 failed**. The four failures are stale expectations around the removed `Deliverables awaiting review` queue/UI and are not importer regressions. The AI Review mixed-batch retry regression still passes inside that suite.

### Live real-Sheet read-only validation after importer fixes

A disposable H2-backed smoke test ran the production importer against the three real public/published Google Sheets without creating a public WildTrack workspace and without invoking any Google write operation. Final observed results after fixing Team Formation header inference and Student Number matching:

- Team Formation rows imported/persisted: **318 / 318**
- Current IT411 Tracker students: **303**
- Current Tracker students reconciled to historical Team Formation identity by Student Number: **299 / 303**
- Current unmatched students: **4**, all in `2627-sem1-it411-65`
- Historical Team Formation students absent from the current Tracker and therefore inactive: **19**
- Current teams: **63**
- Active current deliverables: exactly **5**: `MVP Validation`, `Refactored SPMP`, `Refactored SRS`, `Refactored SDD`, `STD`
- Deadline suggestions detected: **5**
- Tracker import metrics: **299 matched, 4 unmatched**

The live smoke test also exposed and verified fixes for two real-source edge cases: the Team Formation first header contains instructional text mentioning `MEMBER #1` as well as `TEAM CODE`, so member-number inference now prefers the real `TEAM DETAILS MEMBER #` column; and when a Student Number is present it is authoritative, so a failed Student Number lookup no longer falls through to a possibly unrelated team/member match.

The temporary live-Sheet smoke test source was removed after recording these results. It is not part of the product or permanent test suite.
### Deployment and real validation-workspace gate

The locally verified semester-aware changes are still in the dirty working tree on branch `wildtrack-rebrand`. At the time of this verification, both local `HEAD` and `origin/wildtrack-rebrand` point to commit `b656dac` (`fix: harden review workflows and persistent sessions`), so the newly verified importer/test changes are **not yet represented by the remote commit** and no deployment containing this exact dirty-tree state has been verified.

Do not create the real public validation workspace on an older deployment. The next operational sequence is:

1. review/finalize the dirty diff and preserve all intended existing changes;
2. deploy the verified combined code through the project's normal deployment process;
3. verify the deployed health/auth/importer behavior;
4. create `IT411 2627 SEM1 - MVP Validation`;
5. import exactly once in this order: old Team Formation, old Software Project Monitor, current IT411 Tracker;
6. verify 303 current students, the exact current-team count, exactly 5 current deliverables, deadline recognition, 299 historical identity reconciliations, Team 65 as new, historical-only students inactive, old source codes preserved, current Tracker codes operational, and no Google mutations.

## Purpose of this file

This document is the working handoff for the IT411 Capstone 2 MVP Validation activity. If the current ChatGPT conversation is lost or a new chat is started, read this file first together with `docs/it411_capstone_2_midterm_flow.md` and continue from the latest status recorded here.

## Current project context

The current product is **WildTrack**, a substantial evolution of the earlier **CapVault: A Capstone Project Tracking and Archival Management System** concept created during Capstone 1.

The original CapVault SRS and SDD from 2026-05-22 are preserved in:

- `docs/SRS (2526-sem2-it332-41) (CapVault).pdf`
- `docs/SDD (2526-sem2-it332-41) (CapVault).pdf`

Those documents are useful as historical/baseline artifacts, but they are not accurate specifications of the current application. The original project was repeatedly denied and the present project direction was produced very late in Capstone 1 after stakeholder discussion with Sir Ralph Laviste. The current WildTrack implementation now differs materially in workflow, identity, submission handling, review, Document Check, AI Review, persistence, and UI/architecture.

The academically defensible continuity is:

`Capstone 1 CapVault concept -> original SRS/SDD -> stakeholder feedback and late pivot -> current WildTrack MVP -> IT411 MVP validation -> refactored WildTrack SRS/SDD/SPMP`

The Week 1–2 validation should therefore evaluate the **current WildTrack MVP**, not force the current system to conform to obsolete CapVault specifications.

## IT411 MVP Validation requirements

Deadline shown in the current instructions: **September 12, 2026 at 11:59 PM**.

Five required submission artifacts:

1. **Google Form — Validation Instrument**
   - aligned with the selected research/evaluation framework;
   - addresses SMART objectives and measurable outcomes;
   - contains role-appropriate questions;
   - includes open-ended qualitative questions.

2. **PDF — Validation Framework / Model**
   - identify and explain the selected framework/model;
   - justify why it fits WildTrack;
   - map SMART objectives to evaluation constructs;
   - group questionnaire items by objective;
   - identify intended respondent/user types.

3. **Google Sheet — Validation Responses**
   - linked to the Google Form;
   - properly records responses;
   - identifies respondent roles where appropriate;
   - organized for later analysis.

4. **PDF — MVP Validation Highlights**
   - summarize meaningful findings, observations, comments, and recommendations;
   - use Google Form results plus follow-up interviews/discussions;
   - identify problems, features needing improvement, missing/additional requirements, positive aspects to retain, user recommendations, and changes before full implementation.

5. **Google Drive Folder — Validation Evidence**
   - deployed-MVP screenshots/documentation;
   - validation activity photos/screenshots;
   - evidence of user participation;
   - interview notes/consultation records;
   - invitations/communications;
   - other proof that validation was actually conducted.

The course execution notes also require validation with **at least 30 participants** across varied stakeholder roles, with qualitative depth prioritized over empty survey volume.

## Proposed evaluation approach

Current recommendation: use **ISO 9241-11** as the primary evaluation framework, supported by **Task Success Rate**, **Time-on-Task**, **System Usability Scale (SUS)**, and short qualitative follow-up interviews.

Why this fits WildTrack:

- **Effectiveness** measures whether users can actually complete submission, monitoring, and review tasks.
- **Efficiency** measures time/effort saved compared with the existing Google Sheets/Drive/manual workflow.
- **Satisfaction** measures whether the workflows are understandable and usable.
- **SUS** provides a recognized standardized usability score.
- **Interviews/open-ended questions** expose workflow gaps, missing requirements, and reasons behind scores.

The selected framework should still be confirmed with the technical adviser/instructor before the formal instrument is deployed if adviser approval is required.

## Draft current WildTrack SMART objectives

These are working drafts and should be finalized before the Google Form and Framework PDF are built.

### Objective 1 — Student submission effectiveness

During MVP validation, enable representative student users to complete a WildTrack capstone-deliverable submission workflow with a target **task success rate of at least 90% without facilitator intervention**.

### Objective 2 — Student submission efficiency

During MVP validation, enable representative students who already possess a valid submission link/file to complete the core WildTrack submission workflow within a target median completion time to be finalized (provisional target: **3 minutes or less**), while recording errors, assistance, and friction points.

### Objective 3 — Faculty monitoring efficiency

Enable faculty users to determine submission status, late/missing work, and items needing attention **at least 30% faster than the existing manual Google Sheets/Google Drive checking workflow**, measured through comparable task timing during validation where a baseline can be obtained.

This objective has historical continuity with the original CapVault SRS, which already proposed a 30% reduction in adviser submission-status checking time.

### Objective 4 — Review effectiveness

Enable authorized faculty users to locate a target submission, interpret its current status and Document Check information, and complete the intended review action with a target **task success rate of at least 90%** during representative review scenarios.

### Objective 5 — Usability and satisfaction

Achieve an acceptable usability result among representative WildTrack users, provisionally defined as a **System Usability Scale score of at least 68**, while also collecting qualitative feedback identifying major usability barriers, useful features to retain, and missing requirements.

AI Review should be treated as a supporting review/triage capability rather than the central project objective unless the team/instructor decides otherwise.

## Proposed respondent groups

The instrument should use role branching rather than make every respondent answer every question. A provisional 30+ participant distribution is:

- Students: approximately 22–24
- Advisers/faculty: approximately 4–5
- Teacher/Admin/decision-makers: approximately 2–3

This split is flexible. The important requirement is that the user type evaluates the workflow intended for that role. Sir Ralph should ideally be included as a high-value qualitative stakeholder respondent because the product direction is strongly based on his actual capstone workflow.

## Proposed task groups for validation

### Student tasks

- Sign in with Google / establish identity if required by the deployed flow.
- Associate or confirm Student Number where applicable.
- Open the intended deliverable form.
- Submit a valid Google Drive PDF/link according to the form rules.
- Understand and correct a representative validation problem where practical.
- Confirm the submission result/status.
- Locate the submission/status in the student-facing view if included in the test scope.

### Adviser/faculty tasks

- Sign in.
- Locate an assigned/target team.
- Locate the team's latest submission.
- Interpret submission and Document Check status.
- Inspect relevant submission details/history.
- Perform the allowed review/feedback action for the role.

### Teacher/Admin tasks

- Open/select the intended workspace.
- Inspect/import configured academic data where this is part of the pilot.
- Determine who is missing, late, or needs attention.
- Locate a flagged/target submission.
- Run or inspect Document Check.
- Run/inspect AI Review if included in the tested MVP and credentials are configured.
- Complete the intended acceptance/review action.

For each task, ideally record: success/failure, completion time, errors, assistance required, and qualitative comments.

## Important validation principle

Do not simply give respondents the site and ask whether they like it. The validation should combine realistic task execution with post-task survey questions and open-ended feedback. Bugs discovered during testing are evidence, not automatically something to hide before validation. Only true validation blockers should be fixed immediately during the test period.

Suggested severity handling:

- P0: cannot sign in/open/submit -> fix before continuing validation.
- P1: core task cannot be completed -> fix promptly and record the issue.
- P2: task is possible but confusing/inefficient -> preserve as a validation finding.
- P3: cosmetic/polish issue -> record for later unless it materially affects evaluation.

## Evidence and traceability strategy

Assign important findings IDs such as `VAL-001`, `VAL-002`, etc. Each finding should preserve:

- respondent role/source;
- observed problem or positive result;
- quantitative evidence where available;
- qualitative evidence/comment;
- severity/priority;
- proposed change;
- later SRS/SDD/SPMP impact.

This will allow Week 3 traceability such as:

`VAL-007 -> FR-004 -> Submission workflow/component -> implementation task`

## Work completed in the current ChatGPT session

- Read `docs/it411_capstone_2_midterm_flow.md` and identified the five required MVP-validation artifacts and Week 1–2 intent.
- Inspected the current repository context and deployment documentation.
- Read and extracted the original May 22 CapVault SRS and SDD PDFs.
- Determined that the old documents are useful historical/baseline artifacts but are materially obsolete for current WildTrack behavior.
- Established that new SMART objectives can be created for the current MVP rather than pretending obsolete proposal objectives still govern the system.
- Proposed ISO 9241-11 + task metrics + SUS + qualitative interviews as the current evaluation design.
- Drafted five candidate SMART objectives above.
- Identified role-specific validation task groups.

## Current immediate priority

The engineering cleanup and local verification needed before the validation workspace are complete. The immediate priority is now to **deploy the verified combined local changes, verify that deployment, and only then create/import the dedicated MVP-validation workspace** using the one-time snapshot rules above.

After the workspace is verified, finalize the **MVP Validation Instrument and supporting Framework/Model document** together so each survey/task item maps to a finalized SMART objective and selected evaluation construct. ISO 9241-11 + SUS and the numerical targets remain proposals until confirmed.

Do not begin the final Validation Highlights PDF until real participant data and interviews have been collected.

## 2026-09-11 multi-artifact submission and review work

The real IT411 `MVP Validation` submission exposed a form-model limitation that is now the active engineering priority.

- The LMS requires five links in one MVP Validation submission: Google Form Validation Instrument, PDF Validation Framework/Model, Google Sheet Validation Responses, PDF MVP Validation Highlights, and Google Drive Validation Evidence folder.
- Only the two PDF artifacts should be eligible for Document Check. Google Form, Google Sheet, and Drive-folder links must remain ordinary link artifacts and must never clutter Document Check / AI Review queues as failed or unchecked documents.
- Current WildTrack response JSON can already hold multiple named values, but persisted deliverables still collapse to a single `pdfRequired` boolean and the frontend reconstructs exactly one submission field. Document Check and AI Review are currently response-level and resolve one link only.
- Approved direction: introduce stable per-deliverable submission fields with field type, requiredness, order, and per-field review policy. Document Check policy should support `AUTO`, `MANUAL`, or `OFF`; AI Review should be independently enabled/disabled for eligible PDF fields and remain Admin-initiated rather than automatic.
- Review state, templates, currentness, and queue logic must become field/artifact-aware so changing an unrelated Form/Sheet/folder URL does not invalidate a still-unchanged PDF review.
- Legacy one-link deliverables must migrate/backfill safely and retain current behavior.
- Admin form UX must support adding, editing, reordering, and retiring fields without changing stable internal field identity or destroying historical response values.
- `Today's Work` should remain response-oriented but aggregate only actionable review-enabled artifacts, e.g. `2 PDF artifacts · 1 checked · 1 needs checking`, rather than creating noise for unscannable links.
- Newly reported bug added to this work batch: some accepted responses cannot use **Revoke acceptance**. The visible case is already archived, and the current UI explicitly disables revoke for archived responses. Archive/revoke semantics need to be corrected so an acceptance can be reversed without leaving the response stuck in an inconsistent `Archived + Pending` state.

## 2026-09-10 clarification: separate deliverables and parallel-play validation

- In the current IT411 Tracker, `SRS` and `Refactored SRS` (and similarly other original/refactored document columns) must be treated as **separate deliverables**. A later `Refactored SRS` does not replace, rename, or retire the earlier `SRS`; both may remain valid milestones in the same academic history.
- Therefore, tracker schema reconciliation must not automatically infer that similarly named headers such as `SRS` and `Refactored SRS` are renames. Added/removed/renamed classification needs explicit evidence or admin confirmation. Default behavior should preserve both when both appear.
- WildTrack is currently being validated in **parallel play** with Sir Ralph's established Google Forms/Sheets workflow. It is not yet the authoritative production workflow.
- During MVP validation, WildTrack test submissions and review actions must **not automatically update Sir's live Tracker Sheet**. Otherwise a student could submit once through WildTrack for testing and separately through Sir's real form on a different day, producing conflicting lateness/progress values.
- Automatic 10–15 minute Sheet polling/synchronization is therefore deferred. For the current capstone-validation phase, source imports should be deliberate/manual snapshots unless explicitly changed later.
- The safest validation model is: read/import Sir's Sheets as reference data into a dedicated WildTrack validation workspace; perform test submissions/reviews inside WildTrack; store resulting test progress in WildTrack only; keep Google Sheet writeback disabled for the validation workspace.
- If WildTrack is later adopted into Sir's real workflow, live synchronization/writeback rules can be designed as a separate deployment/operations decision after stakeholder approval.

## 2026-09-10 live-sheet compatibility findings

The current semester sources supplied by the project owner were tested directly against their live/published CSV output.

### Source links

- Team Formation (Capstone 1 / previous term): `https://docs.google.com/spreadsheets/d/1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk/edit?gid=1639014359#gid=1639014359`
- IT411 Tracker (Capstone 2 / current term): `https://docs.google.com/spreadsheets/d/e/2PACX-1vRFg8ywqAf3XK2rIQJaGXHQnmpl9Z4xhwJ5P8NkhEg7FaauPGNn7tb-sJ5KMJFU9IHycMoViEHvpL/pubhtml?gid=1793251618&single=true`
- Software Project Monitor (Capstone 1 / previous term): `https://docs.google.com/spreadsheets/d/e/2PACX-1vS01I-ERT-9M0I5O0TDyFKFrhARge3kyRcjqKpB4xkUZczo-JS3PaeXTcT78JpW0uLlafzljGIBDJxX/pubhtml?gid=1174022967&single=true`

### Current IT411 Tracker structure

The actual published CSV contains these headers:

`No.`, `NAME OF STUDENT`, `STUDENT NO.`, `SECTION`, `NEW TEAM CODE`, `MID`, `ADVISER`, `SOFTWARE TITLE`, `MVP Validation`, `Refactored SPMP`, `Refactored SRS`, `Refactored SDD`, `STD`, followed by currently blank future columns.

The bottom deadline row is detected in the live Sheet and currently contains:

- MVP Validation — 2026-09-12
- Refactored SPMP — 2026-09-19
- Refactored SRS — 2026-09-19
- Refactored SDD — 2026-09-19
- STD — 2026-09-26
- additional future deadline cells exist to the right of currently blank headers.

`MID` is believed to mean Member ID / member position within a team.

### Cross-semester identity reconciliation result

The current Team Formation still uses old codes such as `2526-sem2-it332-41`, while the IT411 Tracker uses new codes such as `2627-sem1-it411-41`.

However, the current Tracker also contains `STUDENT NO.`, which provides a stable cross-semester identity key.

Direct comparison found:

- Team Formation students with Student Number: 318
- Current Tracker students with Student Number: 303
- Tracker students matched to Team Formation by Student Number: 299
- Tracker students not found in old Team Formation: 4
- Current teams containing at least one matched prior student: 62
- Ambiguous current-team -> old-team mappings among those 62: 0

For all 62 matched current teams, the prior Team Formation membership maps cleanly to exactly one previous team code. Example:

`2627-sem1-it411-41 -> 2526-sem2-it332-41`

The four unmatched students are all members of new team `2627-sem1-it411-65`, indicating a genuinely new/current-semester team rather than a code-renamed prior team.

The Software Project Monitor contains 65 prior IT332 group records, including the old CapVault group `2526-sem2-it332-41`. Thus project metadata can be carried forward for matched teams if WildTrack introduces explicit cross-semester team reconciliation instead of joining only on the literal team-code string.

### Current importer behavior and gaps

The backend already discovers the most likely header row from the first 20 rows and uses normalized header aliases rather than fixed column positions. Therefore reordering columns generally works.

The importer currently recognizes `NAME OF STUDENT`, `STUDENT NO.`, `SECTION`, `NEW TEAM CODE`, and `ADVISER` correctly. It does not currently recognize `MID` as Member Number, and it does not classify `No.` or `SOFTWARE TITLE` as metadata.

More importantly, the Tracker importer currently treats **every non-identity, non-empty header as a tracker/deliverable column**. On the current IT411 Tracker this would incorrectly classify `No.`, `MID`, and `SOFTWARE TITLE` as deliverables in addition to the real deliverables.

New tracker headers are discovered only when an import/re-import is triggered. There is currently no server-side continuous/scheduled polling of the Google Sheet schema.

When a genuinely new non-identity header appears, `upsertTrackerColumns` creates a new TrackerColumn automatically. However, renamed or removed headers are not reconciled cleanly: the old database TrackerColumn is not automatically deactivated/deleted, so stale columns can remain alongside the new one.

### Recommended durable design before relying on current-term data

1. Treat Student Number as the stable person identity across semesters; do not treat team code as a permanent identity field.
2. Recognize `MID` as Member Number and classify `No.` plus `SOFTWARE TITLE` as metadata/non-deliverable columns.
3. Replace the rule `all non-identity headers are deliverables` with source-aware classification. A strong Tracker signal is the `SUBMISSION DEADLINE` row: headers with a valid deadline underneath them are likely deliverables; known metadata headers remain metadata; unknown headers should be surfaced for Admin confirmation rather than silently becoming forms.
4. Add explicit current-team/prior-team reconciliation based primarily on Student Number membership overlap. Preserve the original source codes and store a canonical/current team relationship instead of rewriting historical source data.
5. Let prior Software Project Monitor metadata follow the reconciled team relationship. Prefer current Tracker values such as current adviser/software title where both old and current sources provide the same field.
6. Add schema fingerprints/sync status for connected Sheets. On recheck, detect added, renamed, removed, and reordered headers and present a change review before mutating deliverables.
7. On re-import, add new confirmed deliverables, update reordered columns, and mark missing/renamed old columns inactive rather than leaving stale active columns indefinitely.
8. Consider periodic low-frequency schema checks (for example on workspace open plus a timed background check) rather than aggressive constant polling. Structural changes should notify the Admin and require confirmation when they would create/remove deliverables or forms.

Do not use the current IT411 Tracker as the real validation workspace until these importer/reconciliation gaps are addressed or the import is manually reviewed and corrected.

## Information still needed from the project owner

Before finalizing the questionnaire, task script, and SMART-objective mapping, confirm the following:

1. The exact **live URL/status** of WildTrack: is `wildtrack.dev` already deployed and usable by outside respondents, or is deployment still pending?
2. Which current WildTrack workflows are stable enough to include in the September 12 validation: student submission, Student Dashboard, Admin Review, Adviser/Team Review, Workspace/Sheet import, Document Check, AI Review, archive, etc.?
3. Who can realistically be recruited before the deadline: approximate number of students, advisers/faculty, and Sir/other decision-makers?
4. Can respondents be observed/timed while performing tasks, or will most participants only receive a link and complete the validation remotely on their own?
5. Is Sir Ralph/another instructor available for at least one short interview or guided test session?
6. Has an evaluation framework already been assigned/required by the instructor, or are we free to propose ISO 9241-11 + SUS and ask for approval?
7. Do you want to keep the provisional numerical targets: 90% task success, <=3 minute student submission, >=30% faculty monitoring-time reduction, >=90% faculty review task success, and SUS >=68? These can be adjusted if they are unrealistic for the current validation setup.
8. What exact respondent information are you allowed/comfortable collecting in the Google Form (e.g., role only, name, email, section, year level)? Prefer collecting only what is actually needed.
9. Do you already have a Google Drive folder / Google Form prepared for this activity, or should we design the full structure and question set from scratch?
10. Are there any instructor-provided wording/templates beyond the screenshots and `it411_capstone_2_midterm_flow.md` that must be followed exactly?

## Next-chat instruction

If continuing in a new chat attached to this repository, tell ChatGPT:

> Read `docs/WildTrack_MVP_Validation_Progress.md` and `docs/it411_capstone_2_midterm_flow.md`, then continue building the WildTrack MVP Validation package from the current status. Do not use the old CapVault SRS/SDD as current specifications; they are historical baseline documents only.


## Confirmed planning answers — 2026-09-10

The project owner confirmed:

- `wildtrack.dev` is already publicly deployed and usable.
- All current WildTrack workflows may be included in validation, subject to any blocker discovered during the pilot.
- The team hopes to obtain approximately 30 respondents, but the exact role split is not yet confirmed.
- Live observation/timing of respondents is possible only if teammates can help; this is not yet guaranteed.
- Sir Ralph is expected to be available on **September 14, 2026**, after the stated September 12 MVP Validation deadline. This creates a compliance risk for any requirement interpreted as requiring current-validation customer feedback before submission.
- No evaluation framework has yet been mandated or approved. ISO 9241-11 + SUS remains a proposal to bring to Sir/instructor for guidance.
- The validation Form and evidence Drive folder have not yet been created; work starts from scratch.
- The project owner is comfortable collecting identifiable participant details such as name, course/year/section, and possibly student ID in order to demonstrate that respondents are CIT-U students. Identifiers should be collected only if needed, kept in the raw restricted response/evidence set, and anonymized in public/summary analysis.

### Deadline handling note

Because the planned Sir Ralph consultation is September 14 while the stated deadline is September 12, the team should not fabricate or backdate stakeholder validation. Options are:

1. request/confirm whether a late or follow-up customer-validation update is allowed;
2. ask Sir for a short asynchronous response before September 12 if feasible; or
3. submit the student/available-stakeholder validation by the deadline and explicitly identify the September 14 customer consultation as pending/follow-up, if the instructor permits this.

Prior Sir Ralph consultations are valid project-history evidence but should not be falsely presented as Week 1–2 validation conducted for this activity.

## New IT411 Tracker compatibility audit — 2026-09-10

The current semester tracker screenshot has the visible columns:

`No.` | `NAME OF STUDENT` | `SECTION` | `NEW TEAM CODE` | `MID` | `ADVISER` | `SOFTWARE TITLE` | `MVP Validation` | `Refactored SPMP` | `Refactored SRS` | `Refactored SDD` | `STD`

and a bottom `SUBMISSION DEADLINE` row containing dates such as `9/12/2026`, `9/19/2026`, and `9/26/2026` under deliverable columns.

### What the current importer handles correctly

- `NAME OF STUDENT` is recognized as Student Name.
- `SECTION` is recognized as Section.
- `NEW TEAM CODE` normalizes to `newteamcode`, which contains the supported alias `teamcode`, so it is recognized as Team Code.
- `ADVISER` is recognized as Adviser.
- The bottom `SUBMISSION DEADLINE` row can be treated as a non-student row and dates in tracker columns can be detected as deadline/form suggestions.
- `MVP Validation`, `Refactored SPMP`, `Refactored SRS`, `Refactored SDD`, and `STD` can be represented as tracker/deliverable columns.

### Current incompatibilities / risks

The production backend currently treats **every non-identity header as a tracker/deliverable column**. This causes three problems with the new tracker:

1. `MID` is not currently recognized as Member Number. Unless manually mapped, it is incorrectly treated as a deliverable/progress column.
2. `No.` is not an identity/metadata field and is incorrectly treated as a deliverable/progress column.
3. `SOFTWARE TITLE` is not an identity field and is also incorrectly treated as a deliverable/progress column.

Therefore the current importer can technically ingest the Sheet, but the result would contain bogus tracker columns and should **not** be trusted for the new validation workspace without a small importer update.

### Cross-source joining behavior

The three sources are workspace-scoped but imported separately:

- **Team Formation** provides the authoritative student roster and Student Number, with Student Name + Team Code required and Member Number/Section/Adviser/email optional.
- **Tracker** imports progress/deadline columns and tries to enrich/match rows against the Team Formation roster.
- **Software Project Monitor** imports group/project metadata and is keyed primarily by Group Code/Team Code.

Current backend Tracker-to-Team-Formation matching uses:

1. Student Number, if the Tracker contains one; otherwise
2. Team Code + Member Number.

The new Tracker screenshot does not contain Student Number, so reliable matching depends on `NEW TEAM CODE` + `MID` matching the Team Formation data. If `MID` means the within-team member number (1–5), we should add `MID` as an alias for Member Number. If the Team Formation source still contains **old team codes** while this new Tracker contains newly assigned team codes, rows will not match and we need an explicit transition/mapping strategy rather than silently joining by name.

Software Project Monitor metadata similarly relies on Group Code/Team Code. Reusing last semester's Project Monitor is safe only if its group codes correspond to the current `NEW TEAM CODE` values, or if we add a deliberate old-code -> new-code mapping.

### Required next check before creating the live workspace

Obtain the current published URLs (or representative header screenshots/data) for:

1. Team Formation
2. IT411 Tracker
3. Software Project Monitor

Then verify whether Team Formation and Software Project Monitor contain the same current team codes shown in `NEW TEAM CODE`, and confirm that `MID` represents member number/order within each team.

Do not assume that reusing old Sheet URLs means the rows still join correctly; URL continuity and key continuity are separate concerns.

## Revised measurement practicality

Live observation is **not explicitly required** by the MVP Validation instructions. It is strongly useful if the team wants true Task Success Rate and Time-on-Task measurements, but it is not necessary for every respondent.

Recommended practical compromise:

- target 30+ Form respondents;
- observe/time a smaller convenience subset (for example 5–10 users) if teammates can help;
- use task-completion self-report + SUS + open-ended feedback for the wider sample;
- do not make an unsupported precise time-reduction claim if no defensible manual baseline is collected.

Accordingly, the provisional `<=3 minute submission` and `>=30% faster faculty monitoring` objectives should remain **drafts** until the team confirms it can collect timing/baseline data. If not, replace them with measurable success/usability targets that the actual instrument can support.
