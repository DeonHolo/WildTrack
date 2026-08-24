# CapVault V2 Workflow Pivot Notes

Status: working brainstorm notes, not final implementation spec.

Identity supersession notice: anonymous submission, optional password accounts, and email-confirmation proposals in this historical brainstorm are superseded by `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`.

## Why This Pivot Exists

Sir Ralph Laviste's feedback changes the center of the product. The system should not feel like a generic portal where students, advisers, and admins manage accounts first. It should feel like an assistant for the existing capstone workflow: Google Sheets, Google Drive, Google Docs, and simple submission links.

The real pain is that Sir Ralph handles many capstone classes largely by himself. CapVault should reduce the repetitive checking, opening, organizing, and monitoring work around class records and submissions.

## Product Direction

CapVault V2 should be Google-first and workflow-first.

Students should be able to submit through generated deliverable links that feel like Google Forms. A student account can exist, but it must be optional. Basic anonymous submission should use Student Number for class-record lookup and auto-fill when possible, but strict Student Number validation/locking belongs to optional account registration.

Sir Ralph, advisers, and teachers need focused monitoring and review views. Student management should be minimal. The priority is fast submission, automatic organization, AI triage, and clear progress visibility.

## Current Form Workflow Observed From Screenshots

Sir currently uses a simple submission forms page with deliverable links and due dates. Each row links to a standalone form for a specific deliverable, such as Problem Exploration, RRL, SRS, SDD, and Software Project Documentation.

The Google Form pattern appears to be:

- A deliverable-specific title and deadline.
- A first section for Student ID, Student Name, and Team Code.
- Dropdowns for known students and teams.
- A later section for deliverable-specific fields such as frontend repo link, backend repo link, and PPT presentation link.
- Submission data is naturally connected to Google Forms, Google Sheets, and Google Drive.

This is the workflow CapVault V2 should respect rather than replace.

## Recommended Submission Link Model

CapVault should support both generated templates and manual creation.

Sir can create a deliverable link from a recommended template, then edit it before publishing. Templates can be based on common capstone deliverables such as Problem Exploration, RRL, Project Proposal, SRS, SDD, Demo, Peer Evaluation, and Final Documentation.

Sir can also create a fully manual link when the class has a special requirement. This matters because capstone deliverables change across weeks, sections, and degree programs.

Recommended flow:

1. Sir creates or selects a class/section.
2. Sir chooses a deliverable template or starts manually.
3. CapVault generates a submission link for that deliverable.
4. Student opens the link without needing a full account.
5. Student enters Student Number.
6. CapVault attempts to match the Student Number against the class record.
7. If matched, CapVault shows the matched name, team code, adviser, and section. If unmatched, CapVault can still accept the submission and flag it for staff review.
8. Student submits Google Drive links, GitHub links, or notes depending on the deliverable.
9. CapVault writes the response to Google Sheets.
10. CapVault accepts the submission immediately instead of blocking the student at the deadline moment.
11. CapVault checks that submitted Drive links are accessible and not empty.
12. CapVault stores the submitted link/response as history in Google Sheets instead of downloading every submitted file.
13. CapVault runs AI triage and writes summary/red flags back to Sheets and/or Docs.
14. Flags become visible to the relevant roles: Sir, adviser, and the submitting student if they create or link an optional account.
15. Sir sees the submission in his attention dashboard.
16. At or near the end of the semester, only the final accepted version is archived from the Sheet/Drive link.

## Student Accounts

Student accounts should be optional, not removed.

The rule should be: submit first, account optional. Students should not need an account when a deadline is near. After successful submission, CapVault can invite them to create or link an account so they can track submissions, view feedback, see submission-link history, and check progress.

One Student Number must only be claimable by one account. If another account tries to claim an already-linked Student Number, CapVault should block it and require Sir/adviser resolution.

Registration should use the class record as the identity source. A student creating an optional account should choose their Student Number from a searchable dropdown populated from Sir's class record. Already-claimed Student Numbers should disappear from the selector or appear disabled. Once claimed, the Student Number is locked to that account and can only be changed by an admin.

When a student enters a Student Number, CapVault should auto-fill the identification fields: Student Name, Team Code, section, and adviser when available. This should happen for anonymous no-account submissions and logged-in student submissions. Logged-in students with a linked Student Number should have these fields prefilled immediately. This removes the current Google Forms risk where Student ID, Student Name, and Team Code are separate dropdowns that can be mismatched.

Because student accounts are optional, email validation can be used as a security layer rather than a hard entry barrier. For registration, CapVault should require email confirmation before permanently linking a Student Number to an account. For anonymous submissions, CapVault can collect an email for receipts/notifications if the form design allows it.

Optional student accounts should expose submission status and AI/accessibility flags. This gives students a reason to create an account without making account creation a submission requirement.

Recommended post-submission message: "Submission received. Create or link an account to track accessibility checks, AI evaluation notes, adviser feedback, and resubmission status."

## Submission Form Decision

The screenshots of Sir's current Google Forms are a UX reference, not a requirement to use native Google Forms.

The current intended direction is a CapVault-owned form that looks and behaves like Google Forms, but is built for the capstone workflow:

- Students do not upload files directly to CapVault.
- Students submit Google Drive links, repository links, presentation links, and notes.
- Student login is not required for the basic submission flow.
- Student Number is used for class-record lookup during anonymous submission, not as a hard identity gate.
- CapVault should run a fast pre-submit check when possible: valid URL, Drive link shape, and quick access check through Google Drive API.
- CapVault can block clearly invalid submissions such as empty required link fields, malformed URLs, or non-Drive links where a Drive link is required.
- If deeper checks are slow or inconclusive, CapVault should still accept the attempt and finish validation after submission.
- CapVault checks whether submitted Drive links are accessible after submission when the pre-submit check cannot fully verify it.
- CapVault checks whether the linked document has actual content, appears empty, is inaccessible, or does not match the expected deliverable.
- CapVault writes submission rows to Google Sheets.
- CapVault stores submission-link history in Google Sheets.
- CapVault does not need to copy/export every linked file immediately during the semester.
- CapVault archives only the final accepted version at or near the end of the semester.
- CapVault shows AI/status flags on each relevant side of the system rather than hiding them in an admin-only area.

Native Google Forms remains useful as a reference for field layout, sectioning, and familiarity. CapVault does not need native file-upload questions because Sir's workflow uses Drive links.

Important distinction: CapVault should not depend on native Google Forms for the student submission page. Native Google Forms may require a Google account depending on form settings, and file-upload questions require sign-in. CapVault's custom form should not require Google login to submit. Students only need to paste Drive links that are shared as anyone-with-link so CapVault can inspect them after submission.

## Google Workspace Structure

Everything visible to Sir should land in Google Workspace.

Suggested structure:

- Master Class Record Sheet
  - Students
  - Groups
  - Advisers
  - Tracker
  - Deliverables
  - Submission Links
  - Submission Responses
  - AI Evaluation Results
  - Archive Index
  - Activity Log

- Google Drive Root Folder
  - CapVault
  - School Year / Semester
  - Course / Section
  - Deliverable
  - Team Code
  - Final archived submissions
  - AI evaluation reports
  - Archived/final files

- Google Docs
  - AI summary report per submission or per team/deliverable.
  - Optional adviser review notes.
  - Optional final archive report.

The backend can still exist, but it should act as the automation layer: validation, link generation, Drive organization, AI evaluation, hashes, and dashboards. Sir should mostly see Google artifacts and a focused monitoring dashboard.

## Google API And OAuth Direction

When Sir says "Google API," the most important APIs for CapVault V2 are Google Sheets API, Google Drive API, and Google Docs API.

- Google Sheets API reads Sir's class record, reads student/team/adviser mappings, writes submission rows, writes tracker lateness values, and writes validation/AI status columns.
- Google Drive API checks submitted Drive links, reads metadata, verifies whether the linked file is accessible, checks file type/MIME type, detects PDF vs editable Google Docs, exports final accepted files when archiving, and stores final archive files in controlled Drive folders.
- Google Docs API can create longer AI evaluation reports or archive notes when Sheet columns are too short for useful review detail.
- Google OAuth is still useful, but mainly for Sir/teacher/adviser/admin registration, optional student accounts, and granting CapVault permission to operate on the connected Google Workspace resources.
- Basic student submission should not require Google login. Students can submit through generated CapVault links by entering Student Number and required Drive/PDF/repo links.

## PDF-Only Submission Policy

Sir prefers PDF submissions because editable Google Docs let students submit before the deadline and keep editing afterward.

Recommended rule:

- Deliverables that require documents should require PDF links, not live Google Docs links.
- CapVault should check the submitted Drive file metadata and MIME type through Google Drive API where possible.
- If the link points to a PDF, accept it and record the submission attempt.
- If the link points to an editable Google Doc/Slides/Sheet, CapVault should strictly block submission for PDF-required deliverables.
- If CapVault cannot verify that the link is a PDF because the file is inaccessible or metadata cannot be read, the submission should be blocked for PDF-required deliverables with a clear message.
- PDF snapshot conversion from Google Docs is not part of the default V2 workflow. It can be reconsidered later, but strict PDF enforcement is the current product decision.

The core rule is not "PDF because PDF is nicer." The core rule is "freeze the submitted document at the submission timestamp." A real PDF link does this best. A generated PDF snapshot can also do it, but only if CapVault successfully captures the snapshot immediately.

Detection approach:

- Extract the Drive file ID from the pasted link.
- Use Google Drive API `files.get` to read metadata such as `id`, `name`, `mimeType`, `size`, `modifiedTime`, and `webViewLink`.
- Accept only files whose MIME type is `application/pdf`.
- Block Google Workspace editor MIME types such as Google Docs, Slides, and Sheets because they remain editable after submission.
- Block files that cannot be accessed or verified as PDF.

## Current Architecture And Legacy Handling

CapVault V1 should be treated as legacy reference, not as the product architecture for V2.

Recommended handling:

- Preserve the current app in git with a clear branch or tag, such as `legacy/v1-capvault-demo`.
- Start V2 on a new branch or clean project path focused on the Google-first workflow.
- Reuse only the parts that still fit: Google Sheets connection, class record field knowledge, class record parser/mapping ideas, and any useful status/dashboard concepts.
- Do not carry over the heavy portal-first architecture, login-first flow, or generic vault assumptions if they fight Sir's workflow.
- Clean local generated artifacts such as verification folders, logs, and temporary outputs after the legacy branch/tag is safely preserved.
- Add ignore rules for generated local artifacts so they do not keep polluting the repo.

## DriveSafe Reference And Archive Storage

The "binary archive" discussion refers to the teammate's DriveSafe repository: https://github.com/klaydgg12/DriveSafe

DriveSafe describes a Binary Vault approach where raw PDF bytes are extracted from Google Drive and stored as database BLOB data, with SHA-256 hashing, version tracking, Sheets integration, and PDF text processing. This is relevant to CapVault as a reference, but Sir's described workflow does not require archiving every submitted version during the semester.

For CapVault V2, "versioning" mainly means preserving every submitted link/response row in Google Sheets. The final archive should store only the final accepted version, usually after revisions are done near the end of the semester.

The key idea is not that files need to be "converted to binary." Files are already byte data. The important archive requirement is to preserve the final accepted document or exported bytes, keep stable metadata, and verify integrity later.

Recommended archive rule:

- Store every submitted Drive link and source Drive file ID in the Sheet history when available.
- Do not download/copy every submitted version just to maintain history.
- Archive only the final accepted version after review/revisions are complete.
- Download the final accepted PDF bytes at archive time so CapVault has an independent copy, not only a pointer to the student's Drive file.
- Store the independent archive copy in controlled archive storage. For local/demo use, this can be local filesystem storage. For production, this should be institutional storage or managed object storage such as Cloudflare R2.
- A Google Drive copy can still be created for Sir's convenience, but it should not be the only archive copy if Sir wants preservation independent of student Drive or personal Drive.
- Preserve the archived final PDF bytes exactly after capture.
- Store file metadata: original filename, MIME type, size, submitter, timestamp, Drive file ID, deliverable, team, final version/reference row.
- Generate and store a SHA-256 hash for integrity.
- Because V2 uses strict PDF submission for document deliverables, final document archives should normally be stored from PDF bytes rather than exported from editable Google Docs.
- During the semester, never overwrite the Sheet submission history.
- After final archiving and semester close, Sir can manually clear/purge working submission history if he no longer needs it.

For the demo, the most explainable version is Sheet-based submission history plus an independent archive folder/storage area for final accepted PDF bytes and SHA-256 verification. A Drive copy may be mirrored for visibility, but the archive proof should come from the independent stored bytes and hash.

## AI Evaluation Direction

The AI tool should start as a triage assistant, not an automatic grader.

Phase 1 should focus on red flags and summaries:

- File is unreadable, empty, too short, corrupted, or wrong type.
- Required sections appear missing.
- Submitted links are broken or inaccessible.
- The document looks unrelated to the expected deliverable.
- Summary of what is inside the file.

Phase 2 can add IEEE/SRS/SDD checklist evaluation:

- Required sections present.
- Formatting and structure cues.
- Expected diagrams/tables/appendices.
- Missing or weak areas.

Phase 3 can add advanced scoring or rubric support, but this should be positioned carefully as adviser assistance rather than final grading.

AI evaluation should not block the initial submission. The system should record the attempt first, then attach evaluation status after processing. This is better for deadline UX and still gives Sir visibility into bad links, empty files, or suspicious submissions.

## AI Evaluation Trigger And Cost Control

CapVault should not fully evaluate every resubmission automatically forever. That would encourage students to repeatedly resubmit until the AI looks satisfied, and it would burn API budget.

The better model is two-tier evaluation:

1. Lightweight automatic checks run after every submission.
2. Full AI document evaluation runs only when Sir/adviser requests it, when a submission is selected for review, or when a controlled rule allows it.

Lightweight checks can include:

- Link format is valid.
- Drive link can be opened by the configured account.
- File type appears supported.
- Text can be extracted.
- Document appears empty or not.
- Document appears to be only the unchanged Sir-provided template.
- Basic title/deliverable mismatch detection when cheap.

Full AI evaluation can include:

- Summary.
- SRS/SDD/IEEE checklist.
- Missing sections.
- Diagram/table observations.
- Weaknesses.
- Recommendations.
- Comparison against previous evaluation.

Student dashboards should show only submission status and actionable flags by default: received, checking, accessible/inaccessible, readable/unreadable, appears empty, needs attention, reviewed, feedback available, or resubmission requested. Full AI reports should be visible to Sir/advisers first. Sir/adviser can choose whether to send a report or selected feedback to the student.

The referenced IEEE Docs Evaluator supports this direction. Its README describes teacher/student dashboards, Google Drive and Sheets integration, AI-powered document analysis, SSE progress streaming, prompt customization, history/versioning, and teacher feedback. Its backend exposes an explicit `POST /api/ai/analyze` endpoint, stores evaluation history as versions, prevents duplicate in-flight evaluation for the same file/provider, and includes a separate endpoint for sending a saved report to students. Source: https://github.com/Hello-Kalibutan-Team/IEEE-Docs-Evaluator

Recommended CapVault rule: every submission gets cheap checks automatically, but full AI evaluation is controlled by Sir/adviser action, batch settings, or a daily quota. Students do not get the full evaluator by default; they get actionable status.

### IEEE Docs Evaluator Output Model

IEEE Docs Evaluator uses Google Drive document extraction plus OpenAI evaluation. It does not primarily write AI output as small Sheet columns. It builds a long prompt, sends extracted text and page images to OpenAI, and stores the returned evaluation as a text report in evaluation history.

Observed implementation details from the repository:

- `AiController` exposes `POST /api/ai/analyze` to trigger analysis manually.
- `AiService` extracts document content, emits progress events, sends the document to the AI provider, saves a new evaluation history version, and prevents duplicate in-flight analyses for the same file/provider.
- `OpenAiProvider` sends prompt text plus page images to OpenAI chat completions.
- `DocumentReviewPromptFactory` detects the document type, loads rubric/diagram rules, includes class context, includes previous evaluation findings when available, and applies professor custom instructions.
- `PromptSharedRulesService` defines the expected report sections: empty-document check, document title, members, document type, classifier override, overall score, revision analysis, diagram analysis, missing sections, weaknesses, recommendations, strengths, summary, conclusion, and rubric evaluation.
- `EvaluationHistory` stores file ID, filename, model used, full evaluation result text, teacher feedback, sent/not-sent state, soft-delete state, version number, and extracted page images.
- `EvaluationHistoryRepository` exposes teacher history and only returns student reports when they are marked sent.

CapVault should borrow the control model, not copy the whole output to Sheets. Recommended CapVault adaptation:

- Automatic lightweight checks write compact Sheet columns: access status, readable status, empty/template-only flag, basic summary, suggested action.
- Full AI evaluation produces a longer report, ideally stored in the app and/or a linked Google Doc.
- Sir/adviser decides whether to send the full report or selected feedback to students.

## Role-Specific UX Direction

Sir Ralph's view should be an attention dashboard:

- New submissions.
- Missing/late submissions.
- AI red flags.
- Files needing review.
- Broken/inaccessible links.
- Recently changed tracker rows.
- Archive/integrity issues.

Advisers/teachers should see assigned or selected groups:

- Group progress.
- Deliverable submissions.
- AI summaries.
- Version history.
- Review remarks.

Students should see simple surfaces:

- Submission link flow.
- Optional account/status page.
- Own progress.
- Own submissions and feedback.
- AI/accessibility flags for their own submissions, especially if action is needed.

## Open Questions For Sir And The Team

1. When Sir provides real form/template links, which current fields should CapVault copy exactly and which should it improve for less friction?
2. After Sir sees the AI output, which short Sheet columns should be finalized for the demo: accessibility, empty/template-only flag, short summary, checklist result, suggested action, or all of these?

## Demo Scope Recommendation

The next demo should prove the new workflow, not the old portal architecture.

Minimum convincing flow:

1. Sir imports or connects a class record Sheet.
2. Sir creates a deliverable link from a template and edits fields/deadline.
3. Student opens the link without creating an account.
4. Student enters Student Number and gets matched to class record data.
5. Student submits a Drive link or required deliverable link.
6. Submission appears in Google Sheets.
7. Submission is accepted immediately.
8. CapVault checks the Drive link and records status without downloading every submission.
9. AI summary and red flags appear.
10. Student can optionally create/link an account to view the submission status and AI/accessibility flags.
11. Sir opens the attention dashboard and sees what needs review.
12. Sir archives the final accepted version into Drive with metadata/hash.

## Further Clarification Log

Use this section for unresolved workflow points from Sir or the team. These should not be treated as final decisions until clarified.

### Transcript-Derived Workflow Signals

The transcript in `docs/Transkripsyon sa Audio.txt` is slightly inaccurate, but it reinforces these workflow signals:

- Sir wants a form-like submission flow without requiring students to log in to another platform.
- Essential submission data should return to Google Sheets because his class record is already in Google Sheets.
- Google Sheets acts as the common data graph between submission tracker and archiver.
- Sir wants a duplicate/replica of essential data so class-record computation can be automated instead of manually re-recorded.
- Tracker purpose is mainly to know whether students submitted, whether they were late, and how many days late.
- Student views should be private: students should only see their own status/progress, not the whole class tracker.
- Teacher/admin is the highest role and can see all groups under them.
- Advisers can have limited views for their advised teams.
- A teacher can also be an adviser, so multi-role views matter.
- Archiver still uses Google Sheets and Google Drive links.
- Student files remain in student Google Drive during the semester to avoid filling Sir's Drive storage.
- Archiving happens near the end of the semester when the final version no longer needs revision.
- AI is valuable mainly because Sir does not want to click, download, open, and inspect many files only to discover blank, wrong, or inaccessible submissions.
- Metadata checks such as Google Drive last modified time and GitHub last push can be useful if implementation time allows.

### Class Record Tracker Semantics

The class record screenshot is a reference for how Sir currently tracks capstone progress. The tracker contains student rows, team codes, member numbers, and milestone columns such as ProbExploration, Convergence, RRL, Project Proposal, SRS, SDD, Adviser Assessment, SourceCode, and DEMO.

Important interpretation from Deon:

- A numeric value in a milestone cell means the number of days the submission was late.
- `0` means the requirement was submitted on time.
- Non-numeric values such as dates, blanks, and `#N/A` must be preserved as raw tracker values.
- CapVault should not treat every number as a score or completion percentage.
- Lateness should be based on the first accepted form attempt, matching Sir's current Google Forms/class record behavior after basic form validation. For PDF-required deliverables, non-PDF, editable, inaccessible, or unverifiable links are blocked before they become accepted attempts. After an attempt is accepted, later quality flags such as empty or template-like content do not change the lateness value.

Current direction:

CapVault should write lateness values back into this tracker automatically from the first accepted attempt timestamp. Validation and AI results should be written separately as quality/status flags, not used to change days-late tracking after an attempt has passed basic form/PDF validation.

### Tracker Push-Through Behavior

Team discussion:

- Question raised: "If an empty link is submitted, what happens? Does it push through to the tracker?"
- Current teammate answer from Sia: "No."

Current interpretation:

CapVault is not fully abandoning the tracker. The tracker may still exist as Sir's class-record progress view and may still be read by CapVault. However, a raw submission should not automatically mark tracker progress as complete.

Recommended rule to clarify:

- Submission received means the student made an accepted form attempt after required fields and strict PDF checks pass.
- Tracker lateness should use the first accepted attempt timestamp, even if the submitted file later gets quality flags such as empty, too short, or template-like.
- Validated submission means the link is accessible, readable/extractable, and not obviously empty or unchanged from the provided template.
- Reviewed/accepted submission means Sir/adviser accepted it.
- Empty, too-short, or template-only submissions should not be treated as clean/accepted progress, but they still count for days-late calculation once the form attempt passed basic required-field and PDF validation.
- The validation check should not judge whether the capstone content is good. Poor quality content can still be valid if it is accessible, readable, and not merely blank/template-only.

Team decision from Sia:

- CapVault should write tracker lateness values directly into Sir's tracker sheet.
- It should calculate days-late from the accepted submission attempt timestamp, matching Sir's current workflow while enforcing the PDF-only rule.
- Validation and AI flags should be separate from the lateness number, so Sir can see both "submitted on time" and "needs attention."

### Template-Only Detection

Sir's concern is not only fully empty documents. Students may submit the provided SRS/SDD/project templates without adding meaningful capstone-specific content.

Recommended detection approach:

- Store Sir's official templates for each deliverable when available.
- Extract text from the submitted Drive document.
- Normalize the template text and submitted text.
- Compare similarity and text delta against the official template.
- Detect unchanged placeholder labels such as project title placeholders, bracketed instructions, or "write here" template text.
- Check for capstone-specific signals such as actual project title, team name/code, member names, and section-specific filled content.
- Flag "appears template-only" when the submitted document is highly similar to the original template or has very little student-added content.

Practical scoring idea:

- Link/content accessibility check: can the file be opened and text extracted?
- Template similarity check: how much of the submitted text is still identical to the official template?
- Student-added content check: how many non-template words/sections were added?
- Placeholder residue check: how many placeholders or instruction lines remain unchanged?
- Required-section content check: do the required sections contain real paragraphs, or only headings/template instructions?

Implementation idea:

1. Export or extract readable text from the submitted Drive document.
2. Extract readable text from Sir's official template for that deliverable.
3. Normalize both texts by lowercasing, removing extra spaces, normalizing punctuation, and preserving headings.
4. Treat identity-only changes as low-value changes: names, team code, section, adviser, and project title should not be enough to pass.
5. Split the document into known template sections using headings.
6. For each section, compare submitted section text against template section text using string/token similarity, such as Jaccard overlap, TF-IDF cosine similarity, or a diff ratio.
7. Count meaningful added content per section after removing template instructions and placeholders.
8. Flag the document if similarity is very high, added content is very low, or many placeholders remain.
9. Use AI only as a second-pass classifier for ambiguous cases, such as "does this section contain actual capstone-specific content or only template text?"

If a student only adds names and capstone title but leaves the rest of the template untouched, CapVault should flag it as "appears template-only" or "very low added content." It should not judge whether their actual research is good, but it should warn Sir that the file may not contain meaningful submission content.

This should be a flag, not a hard rejection. It helps Sir avoid opening files that are accessible but effectively useless.

### Submission Attempt Display

All resubmissions should be stored as separate Sheet history rows/link versions during the semester.

Recommended dashboard behavior:

- Show the latest attempt by default so Sir/advisers/students do not drown in duplicate rows.
- Provide an expandable attempt history for each deliverable showing timestamp, submitted link, accessibility status, AI/basic-check flags, and whether it was used for tracker/archival decisions.
- Sir/advisers can inspect all attempts when needed.
- Students can inspect their own attempts if they create or link an optional account.

## Decisions So Far

- Use Google-first workflow.
- CapVault supplements Sir's existing Google Sheets workflow; it should not replace it with another heavy platform.
- Use Google Sheets API, Google Drive API, and Google Docs API as the core integration layer.
- Use OAuth for staff/admin/adviser registration and optional student accounts, not for basic student submission.
- Use generated deliverable links.
- Use optional student accounts.
- Do not require student login for basic submission.
- Auto-fill Student Name, Team Code, section, and adviser from Student Number instead of requiring multiple identity dropdowns.
- For optional account registration, require email confirmation before permanently linking a Student Number.
- Claimed Student Numbers should disappear from registration selectors or appear disabled, and changing the linked Student Number should be admin-only.
- Run fast pre-submit Drive link checks when possible; block clearly invalid required links, but handle slower/deeper content checks asynchronously.
- For PDF-required deliverables, strictly block non-PDF links and links that cannot be verified as PDF.
- If a non-PDF-required Drive link pre-check fails, show a warning modal and allow "submit anyway"; the attempt still counts for tracker lateness but remains flagged until fixed.
- Notify students when submissions are inaccessible, empty, or template-only when contact information is available.
- Prioritize in-app dashboard notifications first; email notifications are lower priority and can come later.
- Use cheap automatic checks for every submission, but control full AI evaluation through Sir/adviser action, scheduling, or quota.
- Full AI evaluation should be manually triggered from Sir's side by default.
- Use Student Number to match anonymous submissions to the class record when possible.
- Strict Student Number validation and locking applies to optional account registration, not basic anonymous submission.
- Treat Drive links as anyone-with-link to minimize submission friction.
- PDF-required deliverables should freeze the submitted document at the submission timestamp by requiring actual PDF links.
- Editable Google Docs/Slides/Sheets links should be blocked for PDF-required deliverables.
- Allow resubmissions; store each attempt as Sheet link history during the semester.
- Base tracker lateness on the first accepted form attempt after required-field and PDF validation, even if later checks flag the document as empty, too short, or template-like.
- Write tracker lateness values directly into Sir's tracker sheet after the accepted submission attempt is recorded; write validation and AI flags separately after checks.
- Tracker writeback does not need a visible explanation layer; a basic background activity log is enough for debugging.
- Archive only the final accepted version, manually triggered by Sir/adviser.
- Final archives should store independent PDF bytes outside the student's Drive link, with SHA-256 verification and Sheet metadata.
- A Google Drive mirror copy can exist for convenience, but it should not be the only preservation copy if Sir wants archive independence.
- Preserve the current V1 app as a legacy branch/tag, then build V2 around the Google-first workflow.
- Reuse only V1 pieces that still fit: Sheets connection, class record mapping/parsing, and helpful status concepts.
- Allow Sir/teacher/admin to see all groups under them; advisers see assigned teams.
- Support multi-role teacher/adviser behavior because Sir can be both teacher/admin and adviser for assigned teams.
- Try GitHub metadata checks if feasible, but keep them optional compared with submission/AI/tracker flow.
- Start with all easy GitHub metadata checks: repository accessibility, last push date, default branch, README presence, and recent commit count.
- Make AI triage central to the value of the system.
- Keep Sir Ralph's dashboard focused on attention and workload reduction.
- Keep adviser/student surfaces much narrower than Sir's view.

## Next Brainstorm Decision

The failed-link submission policy is now mostly decided:

- If a non-PDF-required fast pre-submit check says a Drive link is inaccessible, CapVault can warn the student and allow submit anyway.
- For PDF-required fields, inaccessible or unverifiable links are blocked because CapVault cannot prove the file is a PDF.
- Accepted attempts count for tracker lateness because Sir's current workflow counts form attempts.
- Accessibility/content issues are separate flags that can trigger in-app notifications and later email notifications.

Refined decision: CapVault should perform fast pre-submit checks where possible and block clearly invalid required fields. For PDF-required fields, CapVault strictly blocks non-PDF, inaccessible, or unverifiable links. For non-PDF-required fields, CapVault can warn the student and still accept the attempt when checks are uncertain. Tracker lateness uses the first accepted attempt, while content quality problems become separate flags.
