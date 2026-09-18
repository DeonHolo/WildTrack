# Authoritative decisions

Last reconciled: 2026-09-19. Origin: owner conversation and docs/WildTrack_Capstone_2_Session_Answers.md. Current user scope: prepare this package first; run implementation only after an execution prompt is invoked.

## Research

- Three working objectives: Document Check accuracy; AI Review accuracy/grounded content screening; **student submission transaction correctness**.
- On 2026-09-19 the owner explicitly replaced the earlier status/next-action scenario objective with the student transaction objective. The current proposed working threshold is at least 95% correct across the frozen controlled student submission/revision transaction tasks; freeze the numerical threshold before real collection.
- Objective 3 is scored from real controlled WildTrack task/system evidence, not questionnaire agreement or fictional scenarios. Each eligible student is scheduled for an initial-submission task and one material-revision task under the frozen protocol.
- Objective 3 uses the **existing imported MVP Validation workspace**, not a second synthetic workspace. The owner selected **Refactored SRS** as the common student task. Students paste a Google Drive link to their own existing Refactored SRS PDF. No WildTrack student submission flow uploads a file; PDF/document inputs are links.
- Add one required research-only field to the Refactored SRS form: **Validation step** with **Initial submission** and **Revised submission**. T1 uses Initial submission; T2 edits only that field to Revised submission while keeping the PDF link unchanged.
- Sir Ralph is the sole Admin/beneficiary in this validation context. His September 14 consultation transcript is the primary Admin-side qualitative evidence and must not be double-counted as another Admin participant if he also completes a follow-up form.
- Keep the separate synthetic/controlled PDF fixture set for Objective 1 Document Check accuracy. Do not confuse those team-run benchmark fixtures with the PDFs students use for Objective 3.
- This is the owner's selected objective direction, not proof of instructor approval. The 95% number remains a project-defined working threshold until the protocol is frozen. The goal deliberately avoids claiming measured usability, satisfaction, learnability, or speed.
- The friend's perceived learning-speed question may remain supporting feedback only. No claim of measured speed from agreement ratings.
- Ticket 01 finalizes implementable SMART wording/metrics for all three, proposes transparent achievable targets for 1/2, selects/cites an appropriate goal-led evaluation approach, and outputs complete copy-ready Google Form content. Proposed framework/targets must not be labeled adviser-approved.
- Minimum 30 unique stakeholder participants planned: one Admin/beneficiary, 1–2 advisers, approximately 27–28 students. Sir's September 14 transcript is one qualitative consultation, not a fabricated Google Form row.
- Participants answer a short role-appropriate Google Form, but the form does not score Objective 3. Student Objective 3 evidence comes from the controlled task log plus WildTrack system/readback evidence. Do not require timed observation.
- Do not show internal research codes in respondent-facing question titles. Do not use the self-created participant code. Prefer Google Forms Limit to 1 response with email collection off when participant sign-in is acceptable; keep questionnaire duplicates separate from Objective 3 task identity.
- The user manages submission deadlines. Do not restart scheduling questions or impose invented calendar deadlines.
- Official STD template + supplied STD instructions define benchmark authority. No completed team STD yet. Technical PDF fixtures are team-run tests, not questions students must grade or documents students must author.
- Gemini free tier: small staged pilot, no paid fallback or automatic repeat loops. Cache hits are not fresh runs; quota/error cases remain explicit.
- No invented empirical results. Final highlights require actual participant data.

## Form editor

- Full-page app route/tab, replacing modal editing. Google Forms interaction familiarity, WildTrack branding, not a 1:1 clone.
- Screenshot reference: references/google-forms-editor-2026-09-19.png. Centered title/description card, stacked editable question cards, clear selected state, nearby add controls, top preview/save/publish actions.
- Suggested fields generated from available imported/manual data; editable thereafter. Reopening/regenerating does not erase customization.
- "Section" means academic section such as G7, suggested when present. Visual page breaks/branching are not requested by that phrase.
- Core additions: short answer, paragraph, dropdown, multiple choice, checkbox choices; preserve existing typed URL artifacts. These are design defaults derived from the agreed familiar Forms interaction and transcript; no quizzes, media insertion, arbitrary themes, collaboration or Google-hosted form integration.
- Admin can configure student-detail field presentation and optional Section. Student Number/account association remains a system identity invariant; changing a visible label never changes which record is owned. Minimum identifying data required by the server cannot be deleted into an unbound submission. Custom answers never silently overwrite academic source records.
- Requiredness/options/order/duplicate/retire changes persist end-to-end. Duplicate gets new stable identity; edits/reorder retain identity. Historical response values survive retirement and incompatible edits.
- A Drive/PDF field accepts matching Drive links. Ordinary Form/Sheet/folder/text fields retain their own rules. Only eligible PDF fields support Document Check and AI Review.
- Preview uses the public respondent rendering path; editing a live form preserves its stable URL and saved responses.
- No generated AI form-authoring feature is implied by "one-shot"; it describes agent execution.

## Academic data

- Keep all imports. Add backend-connected spreadsheet-like Students, Teams/Projects and Deliverables views with typing/paste and import-populated data.
- One data model: data edited in-app is the data used in forms, dashboards and imports.
- Re-import previews differences/conflicts; Admin chooses. Preserve local edits until explicit resolution. Detect stale previews; apply chosen changes transactionally.
- Preserve historical/current team mapping, Student Number reconciliation, metadata classification, distinct original/refactored deliverables, inactive historical records.
- Live Google Sheet writeback/polling remains on hold. Internal editing saves to WildTrack only.

## Identity

- First successful saved submission binds the authenticated Google account to the student record. Opening/failed submission does not reserve it.
- Block another account from submitting under the bound record. Binding and first save must be atomic, concurrency-safe and enforced server-side, including direct API calls and resaves.
- Carry association across semesters using a deliberate canonical person identity while keeping workspace access scoped.
- Admin can disconnect/recover the account binding; replace Identity History-focused Today's Work UX with straightforward account management. Preserve audit/history internally.
- Reject unknown student numbers; retain canonical identity snapshots. Selecting another existing student's valid number is not proof of ownership.
- Pure first-claim binding cannot prevent a malicious first claimant. This limitation remains explicit; do not quietly add mandatory OTP/precollected Gmail or describe ownership as verified.
- Use neutral conflict wording by default, with account details in authorized Admin recovery. Owner proposed a masked email; masking was not established as sufficient security.
- Existing conflicting claims require a non-destructive migration/recovery strategy; never select a winner silently.

## Review, lateness and history

- Document Check and AI Review are advisory; acceptance remains a separate Admin action.
- PDF-only checking. Keep AI grounding/provenance, no-template limits, artifact-specific cache/currentness and explicit Admin initiation.
- No-op response saves do not change lateness/revision/history. Actual artifact value edits do.
- Lateness proposal: effective time is the latest initial submission, material saved artifact change, or verified relevant PDF content-change time. Preserve each source timestamp and show the reason; use existing deadline/timezone policy and verify consistency across student/Admin/adviser views.
- Metadata-only changes are not automatically proven content changes; compare available content identity/checksum, keep uncertainty visible, and never use the check's run time as file-change time.
- Display editor as Full Name (email) when returned identity matches an authorized student record; email otherwise; unavailable if absent. Label "Modified by", not proof of authorship.
- Distinguish WildTrack-observed history from older Google revisions. Current API-key flow lacks delegated history access.
- Keep pasted Drive links; no forced picker. Real older-history access needs suitable file permissions and OAuth; permission/Cloud access cannot be fabricated or enabled by changing the API key.
- Optional delegated Drive history is a gated integration. Prepare the scope/access decision and callback/token flow plan; owner grants Google permissions through genuine UI before live verification. Existing link submission must continue if history is unavailable.

## Execution

- Ticket 01 first. No new interview loop; use documented defaults for reversible details.
- Work only on relevant active frontend/backend paths; legacy is historical.
- Preserve unrelated edits and existing published forms/data.
- Local implementation/testing is authorized only when a future execution prompt is invoked. External writes/releases need their applicable authorization.
