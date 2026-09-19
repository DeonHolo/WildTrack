# WildTrack Capstone 2 — Session Answers and Decisions

Session opened: 2026-09-16

Purpose: Record the project owner's answers to the consultation, resolve scope and evaluation questions, and turn confirmed decisions into next actions. This is a working session record, not completed validation results.

## Superseding Objective 3 decision — 2026-09-19

After re-reviewing the September 14 consultation, the actual student UI, and the friction/validity problems in the scenario questionnaire, the owner explicitly accepted **student submission transaction correctness** as the third SMART goal.

This supersedes the same-day student status/next-action scenario selection recorded below.

Current Objective 3 direction:

- participating students perform a frozen controlled WildTrack task using the real student workflow;
- each eligible student is scheduled for an initial-submission task and one material-revision task;
- correctness is scored from researcher task records plus WildTrack system/readback evidence, not questionnaire opinions;
- the current proposed working threshold is at least 95% correct scored transaction tasks and must be frozen before collection;
- the student questionnaire is supporting current-workflow feedback only;
- remove the self-created participant code, fictional scenario quiz, scenario-only route, forced "None" paragraphs, student AI Review explanation option, and student Submission/Archive History option;
- this is an owner decision, not evidence of adviser approval;
- the goal deliberately avoids claiming measured usability, satisfaction, learnability, or speed.

The approximately 27-28 planned student participants can therefore contribute directly to a primary SMART objective, while the 1-2 advisers and one Admin/beneficiary contribute role-specific MVP validation feedback. Document Check and AI Review retain separate controlled technical benchmarks.

### Objective 3 execution clarification — existing SRS/SDD links

The owner later clarified that Objective 3 should reuse the **current imported MVP Validation workspace** rather than create another fake workspace or generate dummy participant PDFs.

- The owner selected the existing published **Refactored SRS** submission form for the student task.
- Students will paste a Google Drive link to their own existing Refactored SRS PDF. WildTrack student submissions are fields/links only; there is no participant file-upload flow.
- The old official SRS template should be configured so the normal Document Check comparison is visible during the task.
- Add one required research-only WildTrack form field named **Validation step** with choices **Initial submission** and **Revised submission**. It exists solely so T2 can exercise Edit response without asking students to create or replace their real PDF.
- T1: choose Initial submission and submit the existing SRS link. T2: open Edit response, change only Validation step to Revised submission, keep the PDF link exactly the same, then save.
- This real-student document is Objective 3 transaction evidence, not the controlled accuracy dataset for Objective 1.
- Objective 1 still uses the separate team-run frozen PDF fixture benchmark to measure Document Check accuracy.
- Sir Ralph explicitly described the consultation transcript as his Admin-side input. Since he is the sole Admin/beneficiary in this validation context, treat that transcript as the primary Admin qualitative evidence and do not double-count him as an additional Admin respondent.

## Workflow package and third-goal decision — 2026-09-19

The owner explicitly selected the suggested **student interpretation of submission status and next action** as goal 3: at least 90% of participating students correctly answer at least four of five standardized scenarios by the end of the evaluation round. This supersedes earlier ambiguity and the provisional form-generation goal. It remains the owner's selected goal, not evidence that Sir has approved it; preserve the earlier usability concern as a limitation.

The owner requests a workflow and prompts first, with no further clarification interview. The package is at `docs/capstone-2-build/START_HERE.md`, with specs, durable screenshot, official references, code map, checkpoint/evidence files and execution/resume prompts. Local tickets are in `.scratch/capstone-2-session/issues/`. Ticket 01 produces the SMART objectives and full copy-ready respondent Google Form questionnaire before any application implementation. The WildTrack full-page form editor and the hosted participant questionnaire are separate outputs.

Current turn scope is planning/package creation only. A future execution prompt starts app work. Credit/model interruptions must be recoverable from the live progress record. Questionnaire/benchmark results and live OAuth access are not fabricated to close tickets.

## Latest decisions and plain-language corrections — 2026-09-19

These decisions supersede earlier open questions. This remains a planning session; no app changes are authorized yet.

- **Third goal:** The owner meant the student-status interpretation proposal (90% of participating students correctly answer at least four of five status/next-action scenarios), not A/form-generation correctness. However, the owner explicitly requests discussion of a friend's alternative before finalizing. Keep student interpretation as the preferred candidate, with final objective choice/threshold pending this comparison; do not switch back to A without a decision.
- **Friend's alternative:** “How quickly the user learns how to use the app”; “80–85% of students say it is quicker to understand WildTrack.” Assessment: useful learnability feedback, weak primary goal for this consultation. Agreement measures perceived ease, not actual learning speed; “quicker” needs a comparison; a specific threshold and evaluation period must be justified/defined. Sir had already challenged usability-centered objectives. An actual learning-speed study would require a defined first-use task and measured performance, not only agreement ratings.
- **Correction to assistant's recommendation:** Scored status scenarios are more objective than agreement ratings but remain close to usability/comprehension. Not using SUS does not automatically satisfy Sir's objection to usability as a primary objective. The assistant must not claim either candidate is adviser-approved or certain to qualify. Keep any imagined adviser critique clearly labeled as an interpretation based on the transcript, not a quotation or new stakeholder evidence.
- **Section field:** This means the student's academic section (e.g. G7), added to the form as a suggested editable field when the imported data contains it. It does not mean visual section/page breaks; those are not added requirements from this clarification.
- **Account administration:** Provide a straightforward Admin action to disconnect a Gmail from a student record when needed. This should replace the current Identity History experience in Today's Work. The owner did not request erasing underlying historical evidence; retaining internal audit records is an implementation recommendation. No additional “labels/order/roster-controlled” decision is needed from the owner now. Existing editable form-field and one-account binding decisions remain in force.
- **Re-import:** Preview differences/conflicts and let Admin choose what to retain; do not automatically overwrite local edits.
- **Across semesters:** Carry the student's Gmail association across semesters/workspaces, retaining workspace-specific access limits.
- **Submission interaction:** Keep pasted Drive links for Drive-typed fields. A PDF chooser is not requested or approved. Enforce the configured artifact type; do not convert every existing field into a Drive/PDF field.
- **Drive authorization:** The owner has not agreed to a new consent flow; they want a clear explanation of why it is needed and who performs it. Public sharing of an individual file grants viewing, not full revision-history access. The developer would implement/configure the Drive API authorization; the file owner or another sufficiently privileged user would approve the Google permission prompt. Developer credentials alone cannot impersonate every student's Drive owner access. Existing Google sign-in does not automatically grant this additional permission. Pasted-link entry can remain, but an appropriate scope/access design must be evaluated; a picker was only one optional design, not a Drive API requirement.

Plain-language distinction: “Anyone with this link can view my PDF” versus “I allow WildTrack to ask Google for this file's history using my account's permissions.” Do not tell users to make their whole Drive public or change files to public-editable. No API-key setting alone supplies that user permission. [Google's revision access guide](https://developers.google.com/workspace/drive/api/guides/manage-revisions) requires a qualifying owner/editor-level role; [revisions.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list) requires OAuth authorization. Complete history remains subject to Google's retention and API limitations.

No new questionnaire is needed in this turn. Explain the two outstanding topics (goal suitability and Drive permissions), let the owner respond, and keep the settled editor/import/account-management decisions recorded.

## Latest clarification — editor scope and evaluation separation, 2026-09-16

This update takes precedence over earlier references to a one-to-one Google Forms clone or possibly removing imports. App implementation remains deferred until the current planning discussion is complete.

### Confirmed editor requirements

- Google Forms familiarity/muscle memory is the reference, not complete feature parity. Irrelevant Google Forms features need not be reproduced.
- The form editor is a dedicated app page/tab, not a popup modal.
- Auto-generate suggested fields, then let Admin edit student-record-related fields and deliverable/artifact fields. Suggested does not mean immutable.
- Student academic Section was discussed as a potential field; clarify whether the current reference also includes visual form sections/page breaks. These are different concepts.
- Keep imports. Add a backend-connected spreadsheet-like academic-data editor supporting direct typing and copy/paste as well as imported data.
- Imported Sheet data populates the same editor; manual input is not a disconnected second store. Importing and typing must produce the same underlying academic records.
- Re-import behavior after local edits requires an explicit conflict rule. Recommended proposal: preview differences and preserve local changes until Admin chooses otherwise.
- “Admin can edit identity fields in a form” must be reconciled with strict account/record binding: suggested proposal is to edit labels, placement, visibility and suitable controls while canonical identity bindings remain protected. Whether the owner also intends student-entered values to modify the roster is not yet decided.

### Third-goal selection clarification

Owner said “let's do your suggestion for 3rd SMART goal.” The preceding assistant reply offered a student-status scenario goal but explicitly retained A/form-generation correctness as the provisional recommendation. Therefore the exact selected goal is ambiguous. Clarify once between A and student-status interpretation; do not record either as finalized or automatically approve the proposed 90%/4-of-5 threshold. Previously confirmed Document Check and AI Review remain the two working areas.

### Explain the STD benchmark plainly

The STD benchmark is **not** the Google Form distributed to respondents. It is the team's controlled test of WildTrack: create deliberately empty/partly completed/meaningful/filler PDFs from the template, submit them to Document Check/AI Review, and compare actual reports with the prepared expected findings. Example: an untouched template should be recognized as uncompleted even though it is a valid PDF.

There are three distinct things:

1. **Respondent validation Google Form:** students/advisers/Admin answer role-appropriate feedback questions and, if selected, scored dashboard scenarios. They do not need to author an STD.
2. **Technical benchmark:** the team runs prepared PDFs to measure Document Check/AI Review accuracy. This produces test records rather than additional respondent survey answers.
3. **The team's eventual submitted STD:** documents actual testing of WildTrack. Genuine benchmark logs can later contribute to it, but synthetic fixture content is never represented as real execution evidence.

The supplied STD template is material used to test the checker. It is not the template for the participant questionnaire. Evidence from the survey and feature tests can both support validation findings, while their participants/cases and measurements remain distinct.

### Drive credentials: what must change

No edit to an API-key permission can grant access to private Drive revision history. The currently configured `CAPVAULT_GOOGLE_DRIVE_API_KEY` identifies the project; current `GoogleDriveProperties`/`GoogleDriveConfig` wire an API-key gateway. Keep that key's existing restrictions.

Proposed route: retain/enable Google Drive API in the Cloud project; configure the OAuth application's allowed Drive scope, then implement matching authorization in WildTrack. Prefer investigating `https://www.googleapis.com/auth/drive.file` with explicit user file selection (Google Picker or a supported open-with/selection flow) over broad all-Drive access. The scope is per-file access, not a read-only scope. `revisions.list` accepts it, but the authorizing user's file role must also permit history access. Merely pasting an arbitrary URL does not establish the per-file app grant. Choosing someone else's viewer-only file does not elevate the user's role.

Backend work is required: delegated access tokens, protected refresh-token storage if ongoing checks are needed, correct per-file grants, revision queries, and unavailable-access handling. Adding a scope in Cloud Console alone does not change current app behavior. This does not require changing the Gemini key; it concerns Google Drive authorization. No credentials or Cloud settings were changed in this session.

Sources checked: [Drive OAuth scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [revisions.list authorization](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list), [revision access roles](https://developers.google.com/workspace/drive/api/guides/manage-revisions).

### Remaining clarification batch

Answer together; no repeat of already settled questions.

1. Third goal: A/form-generation correctness, or student-status interpretation through scored Google Form scenarios?
2. “Section field”: student academic section, visual form sections/page breaks, or both?
3. Admin identity-field editing: labels/order/visibility/controls while binding remains roster-controlled, or should a student's form entries also update roster data?
4. Re-import after local sheet-editor changes: show a conflict/difference preview and let Admin choose which values to keep (recommended), or automatically overwrite local values?
5. Account binding: carry the same student/Gmail binding across semesters/workspaces (recommended), or establish it separately in each workspace? Cross-workspace visibility must remain authorized either way.
6. Older Drive history: acceptable to add a “Connect Drive / choose PDF” consent step for users with owner/editor access, or prefer existing pasted-link flow with only history WildTrack can observe?

First-claim impersonation remains an unresolved limitation of the requested binding policy; this update does not describe first-come identity as verified ownership. No further decision on it is forced during this editor/evaluation clarification.

## Latest owner answers — consolidated batch, 2026-09-16

This section supersedes pending answers and earlier suggestions below. Scope is discussion, clarification, and test planning. Do not change the app yet. Do not resume deadline/extension management; the owner handles scheduling. Do not re-ask the entire questionnaire.

| Item | Answer / decision | Remaining interpretation |
| --- | --- | --- |
| B01 | A, form-generation correctness, selected provisionally. Owner asks whether a student-facing non-SUS goal is possible. | Compare student alternatives before finalizing the three goals; do not silently replace A. |
| B02 | Only official `docs/STD TEMPLATE.pdf` is available; owner supplied detailed STD instructions. | Template has now been read; authority and expanded tests recorded in the benchmark plan. No completed student STD exists yet. |
| B03 | Owner did not understand “check expected labels.” | Explain plainly: a teammate checks the prepared answer key, e.g. “this file deliberately has no actual test results,” before comparing the app's verdict. This is not asking them to author or grade a complete STD. No evaluator committed yet. |
| B04 | Owner handles deadlines; stop asking about schedule. | Do not invent a new submission date; leave SMART timeframe as an agreed evaluation period until chosen. |
| B05 | One Admin/beneficiary (Sir Ralph); approximately 1–2 advisers, depending on teammates; approximately 27–28 students. Participants are intended to answer a Google Form; minimum total 30. | These are recruitment expectations, not completed responses. Do not require observed/timed sessions or silently treat questionnaires as proof of technical accuracy. |
| B06 | Complete this discussion/planning first, before app changes. | No implementation, deployment, live writes, or live benchmark calls in this phase. |
| B07 | AI findings remain advisory. Document Check and AI Review do not accept submissions; Admin decides acceptance. | Clarification: input-save validation and academic acceptance are different operations. Existing advisory behavior verified in source. |
| B08 | Desired future form editor should reproduce Google Forms editing experience as closely as feasible. Also explore an intuitive in-app data-entry sheet covering inputs currently spread across Team Formation, Tracker, and Software Project Monitor. | Google Sheet import becoming optional is undecided. New input model is proposed future work, not already implemented or an unambiguous transcript mandate. |
| B09 | No pre-collected Gmail roster. Bind the Gmail used for the first successful submission to that student record; block later submissions under a different Gmail. Owner proposes a masked-email conflict hint and asks about current invalid-details behavior. | Record desired rule, but first-claim impersonation remains unresolved. Partial email masking does not establish first ownership. |
| B10 | Yes: one bound account, with Admin-controlled correction/recovery. | Binding scope (global person versus workspace roster row) remains a design seam to define, not silently assumed. |
| B11 | Keep document/AI checking PDF-only. Lateness should reflect changed Drive PDF content or an actual saved change to artifact/submission fields. Opening Edit Response and saving unchanged values must not change lateness. Invalid identity edits should be blocked. | Current no-op save is already implemented; current lateness formula does not yet use changed response time or Drive modification. |
| B12 | Wants change history with editor and change time. Display linked student full name + email where available; otherwise email. | Wants explanation of earlier Drive history versus WildTrack-observed history. Google may withhold editor/email or history; never substitute submitter identity for unknown editor. |
| B13 | Hold Sheets-writeback decision pending teammate discussion; focus elsewhere. | Preserve existing no-writeback behavior. Do not reopen now. |
| B14 | Gemini free tier; low quota. | Use a small initial benchmark and avoid unnecessary reruns. No provider runs performed here. |
| B15 | No known additional evaluation constraints. | Recommend framework and numerical targets only after objective/evidence choice. |

### Student-facing goal alternatives without SUS

A student-facing goal does not have to be usability. It can evaluate a concrete result, but the evidence method must match the claim.

- **Submission-status understanding (best fit for Forms-only collection):** show standardized dashboard scenarios in the Google Form, ask whether work is submitted/accepted, which artifact is pending, and the correct next action, and score against an answer key. Proposed objective: by the end of the defined evaluation round, at least 90% of participating students correctly answer at least 4 of 5 scenarios. The threshold is an assistant proposal, not approved. This measures interpretation of a tested dashboard view, not actual successful use of the live app. Sir previously rejected generic “submission and status clarity” as usability, so a scored interpretation task is a candidate requiring caution, not a guaranteed accepted replacement.
- **Student submission data integrity:** controlled valid/invalid/duplicate-identity cases; measure correct attribution and blocking. This is separate from PDF checking, but requires actual system tests. A Google Form opinion survey cannot establish that protection works. It would also depend on the proposed association changes, which are not yet implemented.
- **Response-edit preservation:** controlled edits/no-op saves; measure whether intended artifact changes persist while unchanged artifacts and no-op timestamps remain intact. Separate from document-change detection, but still close to the tracking topic the owner rejected; lower-priority candidate, not recommended over A.

Recommendation: retain A as the current third technical goal unless the owner chooses a student alternative. The 27–28 student participants can still provide role-specific beneficiary feedback and scored scenarios; every SMART goal need not be measured by every respondent. Maintain distinct evidence streams: controlled feature tests for accuracy, student scenario responses for comprehension, role-specific survey/interview feedback for validation.

### What current source actually does

Source inspection only; no fresh runtime tests or production checks were performed for these findings.

| Scenario | Current behavior and evidence | Requested change / implication |
| --- | --- | --- |
| Unknown Student Number | Frontend requires a roster match (`PublicSubmissionPage.jsx:380`); backend throws `No Student Record with that number exists in this workspace.` (`StudentAssociationService.java:102`). | Desired non-existent-record rejection largely exists. Exact UX wording can be improved later. |
| Edited name/team | UI derives identity from roster; association sends student number; backend snapshots canonical roster name/team (`StudentAssociationService.java:102–151`, `FormResponseService.java:132–151`). | Arbitrary name/team does not become canonical stored identity. Selecting someone else's *valid* number is a separate issue. |
| Different Gmail, same valid record | Current service allows competing associations and creates a conflict (`StudentAssociationService.java:96–151`); subject-owned separate submissions are possible. | First-submission account lock is not current behavior. |
| Unchanged Save Response Changes | Parsed values compared; equal values return without timestamp/revision/version change (`FormResponseService.java:104–127`). | Already matches requested no-op behavior at the backend value-comparison level. |
| Actual artifact edit | Prior version archived, values changed, `updatedAt` advanced, revision incremented (`FormResponseService.java:117–127`). | Current lateness still uses `submittedAt`, so update-time recalculation remains proposed. |
| Lateness | `backendDomain.js:97–100` and `workflow.js:492` compute from response `submittedAt`; response mapping preserves separate `updatedAt`. | Does not currently combine latest material edit with Drive Modified. |
| Drive metadata/history | `GoogleDriveApiGateway.java:12–13` requests ID/name/type/size/checksum/modifiedTime/downloadability/link. No editor or revision-history fields are requested there. | History/editor display is new work. |
| AI/acceptance | `AiReviewService.java:49` and `GeminiAiReviewProvider.java:39` explicitly prohibit final grading/acceptance or approval/rejection; dialogs call results advisory; acceptance is a separate review-feedback action. | Keep Admin acceptance separate; no automatic AI acceptance requested. |

### Identity and history feasibility notes

**First-use association:** implement the requested rule as binding on the first successful saved submission, not merely opening the form or attempting a failed save. Use the authenticated Google subject as account identity and email for display; server-side atomic uniqueness is needed to stop concurrent first claims. A second account must not overwrite the bound record. Admin recovery should preserve audit history. These are design recommendations, not implementation performed here.

**Unresolved first-claim risk:** knowing another student's valid ID/name is enough to impersonate them before they claim the record under a pure first-come rule. Masking the existing email only affects later conflict UX and does not fix this. Recommendation: use a neutral conflict message to other accounts and reserve account details for Admin or an appropriately verified recovery flow; do not describe masking alone as privacy compliance. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) explains identity disclosure through differentiated errors. The same principle motivates this recommendation; it does not dictate this exact product design.

**History distinction:** WildTrack-observed history records submissions and versions/metadata it captures from its first observation onward; it can miss intervening Drive edits. Drive revision history requests older file versions, which may predate WildTrack. It is not guaranteed to contain every change or a line-by-line diff. Google's [revision guide](https://developers.google.com/workspace/drive/api/guides/manage-revisions) requires owner/organizer/fileOrganizer/writer access for revision history and notes incomplete histories and purged binary revisions. Public viewer access is not enough to promise this feature. Current `GoogleDriveApiGateway.java:74–83` uses API-key requests; an API key does not grant a student's owner authorization, so this requires an access-design decision, not merely adding fields.

**Editor identity:** Drive's [revision resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions) can return the last modifying user, but only when applicable; its [User resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/User) says email can be absent. UI should say `Modified by`, not imply proof of document authorship. Match available verified editor identity to an authorized workspace record to show `Full Name (email)`; otherwise show returned email or `Editor unavailable`. Do not expose unrelated workspace identities or guess from the submitter. Missing history must remain explicit.

### Forms editor and in-app academic data entry

Feasible as two related surfaces: a Google Forms-like editor for deliverable questions, and a guided spreadsheet-like setup surface for academic data. A unified screen can contain Students, Teams/Projects, and Deliverables views backed by shared records; forcing all three into one flat row format would duplicate data and make conflicts harder to explain. Show required columns, examples, validation feedback, paste/import support, and source ownership. Derive progress from submissions rather than asking Sir to re-enter a second tracker. Retain optional import as a proposal until confirmed.

Transcript basis: Part 01, lines 99–119, discusses a dedicated configuration source and avoiding a redundant tracker. It includes `Still Sheets` at lines 113–115, so the recording does not unambiguously approve removing Google Sheets or prescribe a native sheet editor. The owner's current message adds that future direction. Part 02/06 establish Forms familiarity as feedback; the owner now explicitly prefers close editor parity.

Use Google's [editor help](https://support.google.com/docs/answer/2839737?hl=en) to inventory interactions; the [Forms API](https://developers.google.com/workspace/forms/api/guides) creates/modifies actual Google Forms, rather than providing the source code for a WildTrack editor. Research exact behavior and interaction scope before implementation.

## Sources and evidence boundaries

- `TRANSCRIPT CAPSTONE 2.md` — primary consultation source; use the chronological dialogue to distinguish adviser requirements, user preferences, and team suggestions. The consultation date is not established by the transcript metadata.
- `WildTrack_MVP_Validation_Progress.md` — prior decisions and engineering reports, last updated 2026-09-15. Older proposed work is superseded where later sections record implementation or release. Reported implementation and deployment status has not been independently reverified in this session.
- First project-owner answers were received on 2026-09-16 and recorded below. Proposed directions remain distinct from confirmed decisions.
- Two supplied screenshots show available documentation-template links and the submission schedule. They establish visible labels/dates, not the linked documents' contents or a new deadline extension.

## What the consultation establishes

| Topic | Source | Interpretation for this session |
| --- | --- | --- |
| Form configuration | Parts 01–02 and 06 | Present workable input/configuration options. Google Forms familiarity is user feedback, not a mandate to clone Google Forms. The tracker alone does not specify every field requirement. |
| Student privacy | Parts 02–03 | Restrict an authenticated student to their associated record. Sir is open to initial preparation, including collected roster emails. The students' first-come-first-served suggestion does not establish that first ownership is verified. |
| Research design | Parts 03–04 and 06 | Finalize at least three SMART goals, then choose fitting evaluation frameworks and instruments. SUS does not count toward the three goals. Sir's stated SUS expectation is feedback, not a measured score. |
| Document checking | Part 04 | Access, downloadability, PDF integrity, readable text, file type, and size checks are useful and should not be dismissed as redundant. |
| Submission content | Parts 04–05 | Detect wrong deliverables, untouched templates, empty sections, and filler in context. Sir explicitly distinguishes this from grading academic correctness. Filename/header matches alone do not establish meaningful content. |
| AI grounding | Part 04 | Do not invent template requirements. The progress notes report a later grounding-hardening implementation; it still needs empirical evaluation rather than treating code tests as accuracy results. |
| Modification history | Part 05 | Make changes, submission versions, times, and available editor metadata visible. The transcript's assumptions about Drive API availability need technical verification before promising complete history or authorship. |
| Follow-up validation | Part 06 | Sir says another consultation is not necessarily required before proceeding. Separate his instructor expectations from beneficiary feedback in the findings. |
| Sheets writeback | Part 06 | The closing writeback proposal is primarily team discussion. Existing recorded policy remains manual reference imports and no live-Sheet writeback during parallel validation unless explicitly revised. |

## Relevant prior decisions to carry forward

- The progress file records public deployment, a target of at least 30 validation participants, and five required artifacts: instrument Form, framework/model PDF, response Sheet, highlights PDF, and evidence folder. Actual collection/submission status needs an update.
- Multi-artifact forms and independent PDF reviews are recorded as implemented and released; do not describe them as wholly missing based on older notes.
- The September 15 identity notes describe handling multiple claimants and conflicts. This does not by itself demonstrate the strict, verified single-record association discussed in the consultation.
- The older ISO 9241-11/SUS-centered objective set is a draft requiring revision in light of the consultation. No replacement framework, target accuracy, or achieved result is confirmed here.
- Keep original and refactored deliverables distinct. Continue treating existing source Sheets as reference snapshots during validation.

## Round 1 — Context and research direction

### Q01 — Consultation date and actual validation progress

Was this consultation on September 14, 2026? What has actually been completed or submitted so far among the five validation artifacts, how many real responses/interviews exist by role, and what deadline or late-submission arrangement now applies?

Answer (2026-09-16): The owner confirms the consultation was September 14, 2026; reports none submitted and one validation participant so far: Sir Ralph, the application's beneficiary, represented through this transcript in the Admin role. Individual artifact preparation status was not specified. No revised deadline or late-submission arrangement was supplied.

Decision / next action: Count this as one qualitative stakeholder consultation, not a completed questionnaire response or multiple participants because Sir speaks from several perspectives. Preserve instructor comments separately from Admin/beneficiary feedback. The supplied schedule still shows MVP Validation due September 12, 2026 at 11:59 PM; Refactored SRS and RTM, SPMP, and SDD due September 19; STD due September 26. Confirm remaining preparation status and submission arrangements later.

### Q02 — Three research goals

Have you already selected revised SMART goals after the consultation? If not, a candidate set for discussion is (1) detecting wrong/empty/filler submissions, (2) producing evidence-grounded AI findings without invented requirements, and (3) detecting and reporting post-submission file changes. These are candidate topics, not finalized SMART goals; the first two need distinct outcomes to avoid double-counting. Would you prefer another third topic, such as monitoring accuracy or time savings?

Answer (2026-09-16): The owner understands the two discussed goals as Document Check accuracy and AI Review accuracy, and asks whether only one more is needed.

Transcript verification: Yes. Part 06, lines 475–477, says three SMART goals are the minimum, that Sir heard approximately two already decided, and that the team must identify the remaining one, excluding SUS. He does not formally enumerate or finalize the two goals in that closing passage. Parts 04–05 support Document Check and content/AI screening as the two working areas; numerical thresholds and final SMART wording remain unset. The example 95% in Part 03 is illustrative, not an approved target.

Decision / next action: Use (1) Document Check accuracy, including its existing deterministic template indicators, and (2) AI Review accuracy for content relevance, empty/filler detection, and grounded findings as the working interpretation. This replaces the assistant's initial suggestion to split content screening and AI grounding into two goals. The owner explicitly rejected change/deadline tracking as goal 3 because it belongs to Document Check. Find a third goal in a distinct app capability.

### Q03 — Documents and human evaluation

What real SRS/SPMP/SDD/STD documents and official templates can the team use for evaluation, and who can label correct, wrong, empty, or filler cases and check AI findings: Sir Ralph, other advisers, or the team? Rough quantities and available reviewers are enough for now.

Answer (2026-09-16): The owner believes the team has current-semester STD material and proposes team evaluation, possibly assisted by this AI. It is not yet clear whether this means a completed STD, the official template, or both. Screenshots show links labeled Software Requirements Specification, Software Design Description, Software Project Management Plan, and Software Test Document, plus associated standards. Their contents have not been provided/read.

Owner clarification (2026-09-16): The available STD is the official template. The team has not completed its STD yet because that deliverable is due later. The owner authorizes the assistant to design tests using the unchanged template, small changes, full changes, and other useful variants to measure both features.

Decision / next action: Test design is recorded in `WildTrack_Document_Validation_Test_Plan.md`. Template contents are still needed to generate the actual fixtures. An untouched template is a negative submission example and a structural reference; it is not by itself a complete answer key for meaningful content. Team verification of AI-assisted fixture labels remains proposed, not confirmed. Current code inspection confirms deterministic token/heading template comparison already exists in Document Check; the earlier technical-check-only description was too narrow.

## Later clarification queue

Historical topic inventory. The owner's latest preference is to answer one consolidated batch, with numbered short answers and explicit unknowns. Do not return to two-question rounds. The consolidated questionnaire below supersedes the pacing and wording here.

| ID | Question to resolve | Why it matters |
| --- | --- | --- |
| Q04 | Does the roster already contain trusted Google emails? If not, can students provide them through a verified collection process, or should staff approve association? How should account recovery work? | One-account locking alone cannot establish that the first claimant owns the record. |
| Q05 | Does content screening only flag cases for staff, or block submission/acceptance? How should uncertain or unreadable cases appear? | Define false-positive consequences and preserve a clear human decision point. |
| Q06 | Which form-authoring path should be explored: improve the existing editor, use a dedicated deliverable-configuration Sheet, or compare both with Sir? Which field types are actually required? | Convert familiarity feedback into bounded requirements without assuming a complete Forms clone. |
| Q07 | Are checkable submissions restricted to Drive PDFs, or must native Google Docs also be supported? Should lateness use submission time, last content change, or the last accepted version? | Fix scope and deadline policy before designing metadata/history behavior. |
| Q08 | Is recording versions observed by WildTrack sufficient, or is earlier Drive revision history required? What should happen when editor/history metadata is unavailable? | Separate requested evidence from API access assumptions; editor metadata is not proof of authorship. |
| Q09 | Keep validation entirely in WildTrack, or trial export/writeback only to a separate test Sheet? Is any actual instructor request for live writeback documented? | Resolve the closing team discussion without silently changing the live workflow. |
| Q10 | Which teammates can recruit participants, conduct role-specific sessions, label test documents, and compile evidence, and by when? | Turn the agreed research scope into an achievable collection plan. |

## Confirmed session answers

- Consultation date: September 14, 2026.
- Submitted validation artifacts: none reported; preparation status remains unspecified.
- Participants so far: one, Sir Ralph, through a qualitative Admin/beneficiary consultation.
- Working research areas: Document Check accuracy and AI Review accuracy; the transcript confirms one further goal is needed to reach three, excluding SUS.
- Available test material: official STD template and supplied instructions, now read. No completed current STD yet. Assistant authorized to design benchmark cases.
- Evaluators: team/self-evaluation with AI assistance proposed; labeling procedure not yet agreed.
- Rejected third goal: document-change/deadline tracking; owner considers it part of Document Check.
- Conversation preference: provide many necessary questions in one organized batch; preserve depth without repeated short question rounds. This is recorded for this session, not written to global memory.

### Third-goal prospects — current source inspection, 2026-09-16

These are proposed directions, not finalized SMART objectives. Targets and completion dates remain to be defined. Source inspection establishes available code paths, not current hosted acceptance or measured research results.

| Option | Candidate outcome and measurement | Existing source evidence | Main tradeoff |
| --- | --- | --- | --- |
| A — Recommended | Correctly generate/configure deliverable forms from explicit source requirements. Score correct titles, deadlines, field types, requiredness and preserved edits against a prepared answer key; record setup time/corrections as supporting measures. | `frontend/src/pages/WorkspacePage.jsx:314` generates/updates suggested forms; `frontend/src/pages/FormsPage.jsx:222` saves configured forms; `backend/src/main/java/com/capvault/backend/deliverable/DeliverableService.java:123` validates configuration. | Directly addresses the consultation's automation concern. Tracker titles alone cannot specify every field; evaluate against explicitly supplied configuration, not inferred missing requirements. |
| B | Reduce faculty monitoring effort while preserving correctness. Compare the same missing/late/submitted-work questions using the existing Sheets workflow and WildTrack; record time and answer correctness. | `frontend/src/pages/CommandCenterPage.jsx:80` builds the work queue; `frontend/src/pages/TrackerPage.jsx` provides tracker presentation. | Strong practical benefit, but requires comparable baseline tasks and faculty participation. Frame as operational workload, not another usability/SUS objective. |
| C | Correctly import and reconcile academic data. Score student matches, mismatches, metadata/deliverable classification and deadlines against a labeled sheet fixture. | `backend/src/main/java/com/capvault/backend/sheets/SheetImportService.java:201`; matching/reimport scenarios in `backend/src/test/java/com/capvault/backend/sheets/SheetImportControllerTest.java:252`. | Objectively testable without many faculty sessions, but a narrower technical contribution. Include new/unmatched students and misleading/reordered headers. |
| D | Preserve correct archive records and retrieve the requested submission/version. Score correct artifact/version metadata and search results; retrieval time is secondary. | `backend/src/main/java/com/capvault/backend/archive/ArchiveService.java:72`; `frontend/src/pages/ArchivePage.jsx:79`. | Distinct feature, but do not claim durable PDF recovery from metadata records alone. Storage/download readiness requires separate verification. |

Root cross-check: suggested-form generation does exist on WorkspacePage, in addition to per-form editing on FormsPage. Do not infer its absence from inspecting FormsPage alone. No fresh code tests were run for this planning task.

Suggested direction for A: “By [agreed evaluation date], WildTrack will generate/configure [defined number] of deliverable forms from supplied tracker data and explicit field specifications, achieving [pre-agreed correctness threshold] across required configuration attributes.” This becomes SMART only once the bracketed scope, target and date are settled.

### Consolidated questionnaire

Answer by number in one reply. Short answers are sufficient; `unknown` preserves an unresolved fact and `recommend` delegates a recommendation without treating it as instructor approval. Existing confirmed answers need not be repeated.

| ID | Decision or missing fact |
| --- | --- |
| B01 | Which third-goal prospect from the comparison should we develop: form-generation correctness, monitoring effort reduction, import/reconciliation accuracy, or archive integrity/retrieval? |
| B02 | What is the official STD template link or local file path, and where are its actual deliverable instructions? Are other official templates available for the same test campaign? |
| B03 | Can one teammate check expected fixture labels before seeing WildTrack results? If yes, who? Is a second checker available for disputed cases? |
| B04 | What is the actual submission/collection deadline now? Any confirmed late-submission arrangement? Which of the five artifacts are already drafted or created, even though none were submitted? |
| B05 | How many students, advisers, and Admin/teacher participants can realistically be recruited, and can any do observed/timed tasks? Who on the team will coordinate collection? |
| B06 | Should the pilot evaluate the current deployed behavior, or wait for specific transcript-driven changes? Name only changes that must precede the pilot. |
| B07 | For AI findings, retain staff decision-making with advisory flags, or add blocking behavior? Should any Document Check failures block submission versus only acceptance? |
| B08 | For form creation, is improving the current in-app editor the preferred direction, or should we compare it with a dedicated configuration Sheet? Which missing controls are necessary: dropdown, paragraph, checkbox/multiple choice, conditional fields, or something else? |
| B09 | Are trusted student Google emails available in any roster/collection? If not, is pre-collecting them feasible, or should staff verify initial record association? |
| B10 | Should one record be strictly locked to one verified account, with Admin-controlled corrections/recovery, or is another recovery workflow required? |
| B11 | Keep checkable artifacts PDF-only for this phase, or require native Google Docs too? For deadline calculations, use initial submission, latest substantive file change, or another stated rule? |
| B12 | For Drive history, is history observed by WildTrack enough, or is earlier revision history a requirement? When metadata is unavailable, is an explicit unknown + staff review acceptable? |
| B13 | Keep the confirmed no-writeback validation model, or trial output only to a separate test Sheet? Is live-Sheet writeback now an actual stakeholder requirement? |
| B14 | What AI test budget/quota is available, and should the assistant propose a modest fixture/run count? Cached results must not count as fresh accuracy trials. |
| B15 | Any school-required framework, exact objective wording, evaluation threshold, respondent fields, or artifact template beyond the sources already supplied? If none, the assistant will propose these after the goal and feasible evidence are settled. |

B01–B15 have now been answered or explicitly deferred in the latest owner-answers section above. Preserve this question list as history, not a fresh unanswered questionnaire. Test design is authorized; app implementation is deferred.

## Action register

| Action | Status | Dependency |
| --- | --- | --- |
| Read consultation and compare with progress notes | Complete | Source documents |
| Create this session record | Complete | User request |
| Record current validation timeline and artifact status | Owner manages scheduling; no further deadline questions | Q01 / B04 |
| Finalize three distinct SMART goals | Awaiting discussion | Q02–Q03 |
| Select matching framework(s) and construct-to-instrument mapping | Not started | Finalized goals and feasible evidence |
| Resolve identity, form configuration, and version/deadline policies | Awaiting discussion | Q04–Q09 |
| Prepare ordered implementation and validation tasks | Not started | Confirmed decisions and Q10 |

No code changes, deployment, Google Sheet writes, or new empirical validation results are implied by this document.
