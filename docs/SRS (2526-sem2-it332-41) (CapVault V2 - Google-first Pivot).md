# Software Requirements Specification

## CapVault V2: Google-first Capstone Submission, Tracking, AI Triage, and Archive System

Status: Draft source-of-truth for the V2 pivot  
Date: 2026-06-18  
Primary user: Sir Ralph Laviste  
Working product name: CapVault, pending rename discussion

Identity amendment, 2026-08-19: `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` supersedes this draft's anonymous-submission, optional student account, password registration, OTP, and pre-matched Gmail assumptions. Until this SRS is fully revised, use the amendment for all student identity, dashboard access, response ownership, and draft behavior.

Sheet-mapping amendment, 2026-08-19: fixed assumptions such as `first three columns are labels and every later column is a deliverable` are superseded. Use source-specific required keys, header/value-based suggestions, dynamic milestone and deadline detection, explicit import diagnostics, and user-correctable mappings. The confirmed details are recorded in `docs/CapVaultV2_Post_Demo_Debrief_And_Completion_Roadmap.md`.

Submission-lifecycle amendment, 2026-08-19: due dates determine tracker lateness but do not automatically close or unpublish forms. A response that passes identity, required-field, accessibility, downloadability, and PDF preflight remains a submitted attempt even when later Document Check flags blank, short, incomplete, or template-like content. See `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` Sections 8 and 14.

File-snapshot amendment, 2026-08-19: an unchanged Drive URL is not treated as immutable content. Accepted PDFs receive immutable metadata and SHA-256 snapshots. Changed bytes under the same Drive file ID create version events, invalidate stale checks/reviews, and recalculate canonical tracker lateness from the later material-save/Drive-modified time. See `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` Section 14.3.

## 1. Purpose

CapVault V2 shall support the existing capstone class workflow used by Sir Ralph Laviste. The system shall reduce manual checking, copying, and review work while keeping Google Sheets, Google Drive, and Google Docs as the visible operating environment.

The system shall not force students into a login-first portal just to submit deliverables. Submission shall happen through generated, form-like links. The system shall use Student Number to match submissions to the class record when possible, accept PDF and link submissions according to deliverable rules, write essential records back to Google Sheets, flag problematic submissions through Document Check, provide Admin/Sir with controlled AI Review, and archive only final accepted documents.

## 2. Background And Pivot Rationale

The original CapVault implementation focused on a full portal with roles, local database entities, submission/version control, tracker views, archive records, and dashboards. After review with the intended primary user, the product direction changed.

Sir's main need is not a replacement platform. His workflow is already based on Google Forms, Google Sheets, and Google Drive. CapVault V2 must supplement that workflow by making submission, checking, tracker update, AI triage, and final archiving easier.

The system shall therefore prioritize:

- Google Sheets as the shared data graph.
- Google Drive links as the submission source during the semester.
- Form-like student submission without required login.
- PDF enforcement for document deliverables.
- Tracker lateness writeback based on first accepted submission attempt.
- AI/accessibility flags to reduce manual link opening and document checking.
- Final archive capture of accepted PDF bytes independent of the student's Drive file.

## 3. Scope

### 3.1 In Scope

- Import/connect Sir's class record Sheet.
- Read class record students, student numbers, team codes, member numbers, advisers, sections, and tracker columns.
- Generate deliverable-specific submission links.
- Provide a Google-Forms-like CapVault submission page.
- Use Student Number to look up class record identity data during submission.
- Auto-fill Student Name, Team Code, section, and adviser when the Student Number matches the class record.
- Accept Google Drive PDF links, repository links, presentation links, and other configured fields.
- Strictly block non-PDF links for PDF-required document deliverables.
- Write submission rows and attempt history to Google Sheets.
- Write tracker lateness values to Sir's tracker sheet.
- Count tracker lateness from the first accepted attempt for that deliverable.
- Run lightweight automatic checks for Drive access, MIME type, readability, empty content, and template-like content.
- Let only Teacher/Admin manually trigger individual or selected-deliverable batch AI Review.
- Show role-specific dashboards for Sir/teacher, adviser, and optional student accounts.
- Preserve submission link history during the semester.
- Archive only final accepted PDF versions.
- Store final archive bytes independently from the student's Drive link.
- Store archive metadata and SHA-256 hash.
- Support optional GitHub metadata checks where configured.

### 3.2 Out Of Scope For V2 Core

- Requiring students to create accounts before submitting.
- Replacing Sir's class record with a new primary database.
- Downloading and archiving every submitted attempt during the semester.
- Automatically grading capstone quality.
- Running student code repositories.
- Managing a complex institution-wide user directory.
- Native Google Forms file upload questions.

## 4. Users And Roles

### 4.1 Student Without Account

A student without an account can open a generated deliverable link, enter Student Number, review auto-filled identity fields when a match is found, paste required links, and submit. Student Number matching helps organize the submission but is not an account-proof gate for anonymous submission.

### 4.2 Student With Optional Account

A student with an optional account can view their own submissions, submission flags, feedback, and status. A student account must be linked to exactly one Student Number. Claimed Student Numbers must not be claimable by other student accounts.

### 4.3 Adviser

An adviser can view assigned teams, submissions, Document Check findings, existing AI Review reports, attempt history, feedback, and archive status for advised teams. Advisers cannot trigger or rerun AI Review.

### 4.4 Teacher/Admin

The teacher/admin role represents Sir Ralph or a delegated manager. This role can connect class records, generate deliverable links, manage deliverable rules, trigger AI evaluation, view all relevant classes/groups, write tracker updates, review submissions, and archive final accepted documents.

### 4.5 Multi-role Teacher/Adviser

A teacher may also advise teams. The system shall support combined views without requiring separate accounts.

## 5. External Interfaces

### 5.1 Google Sheets API

The system shall use Google Sheets API to:

- Read class record data.
- Read student/team/adviser mappings.
- Read tracker columns and raw values.
- Write submission attempt rows.
- Write validation and AI status columns.
- Write tracker lateness values.
- Write archive index metadata.
- Write activity/audit rows where useful.

### 5.2 Google Drive API

The system shall use Google Drive API to:

- Extract file metadata from Drive links.
- Verify accessibility of submitted files.
- Check file MIME type.
- Detect PDF vs Google Docs/Slides/Sheets links.
- Download final accepted PDF bytes during archiving.
- Optionally create a Drive mirror copy for Sir's convenience.
- Read metadata such as modified time, owner-visible file name, and size when available.

### 5.2.1 Document Check

The system shall:

- Save a new or edited response before attempting validation.
- Automatically run Document Check after a new response or a materially changed PDF link.
- Verify Drive accessibility, PDF MIME type, download permission, size limit, PDF integrity, password protection, page count, and readable text.
- Compare readable submission text with the official deliverable template where configured.
- Mark old Document Check and AI Review results as outdated when the submitted document changes.
- Retain the response when checking fails.
- Provide scoped batch Document Check actions in Command Center, Admin Review, and Team Review.
- Temporarily download PDF bytes for inspection without treating that temporary download as an archive copy.

### 5.2.2 AI Review Permissions

The system shall expose individual and batch AI Review triggers only to Admin/Sir and only from Admin Review. AI Review shall not run automatically. Advisers may view existing AI Review reports for assigned teams but shall not invoke or rerun AI Review.

### 5.3 Google Docs API

The system may use Google Docs API to:

- Create longer AI evaluation reports.
- Create final archive reports.
- Store richer review summaries that do not fit cleanly in Sheet columns.

### 5.4 OAuth

OAuth shall be used for staff/admin/adviser registration, optional student accounts, and granting CapVault access to connected Google Workspace resources. OAuth shall not be required for basic student submission.

### 5.5 GitHub API

Where configured, the system may check submitted GitHub repository metadata:

- Repository accessibility.
- Default branch.
- Last push date.
- README presence.
- Recent commit count.

GitHub checks are advisory and must not block the core submission flow unless a deliverable explicitly requires a repository link.

## 6. Functional Requirements

### FR-001 Class Record Connection

The system shall allow Teacher/Admin to connect a Google Sheet class record.

Acceptance criteria:

- The system can read the configured class record.
- The system can detect or map Student Number, Student Name, Team Code, Member Number, adviser, section, and tracker milestone columns.
- The system preserves raw tracker values such as numbers, dates, blanks, and `#N/A`.
- The system can refresh class record data after changes.

### FR-002 Student Identity Lookup And Account Claim Validation

The system shall use submitted Student Numbers to look up class record identity data for anonymous submissions. Strict Student Number validation and locking shall apply only when a student creates or links an optional account.

Acceptance criteria:

- A matched Student Number auto-fills Student Name, Team Code, adviser, and section where available.
- An unmatched Student Number does not block anonymous submission by itself.
- Unmatched anonymous submissions are recorded with an `Unmatched Student Number` flag for Sir/Teacher/Admin review.
- Tracker writeback is skipped for unmatched anonymous submissions until Teacher/Admin resolves the identity.
- Optional student accounts can claim only unclaimed Student Numbers.
- Changing a claimed Student Number requires Teacher/Admin action.

### FR-003 Deliverable Link Generation

The system shall allow Teacher/Admin to create deliverable-specific submission links.

Acceptance criteria:

- Each deliverable has title, description, due date, target tracker column, expected fields, and validation rules.
- The generated link opens a standalone form-like page.
- Teacher/Admin can edit generated form fields before publishing.
- Fields can include PDF Drive link, frontend repository link, backend repository link, presentation link, notes, and configurable text/link fields.

### FR-004 Form-like Student Submission

The system shall provide a submission page that feels familiar to Google Forms but is owned by CapVault.

Acceptance criteria:

- Student login is not required.
- Student Number is the primary identity input.
- Identity fields auto-fill from the class record when a match is found.
- Anonymous submissions can still proceed when the Student Number cannot be matched, but they are flagged for review.
- Students can submit required links and notes.
- The page clearly marks required fields.
- The page shows clear errors for missing fields, invalid links, or blocked file types.

### FR-005 PDF-only Enforcement

The system shall strictly enforce PDF-only submission for PDF-required document deliverables.

Acceptance criteria:

- The system extracts the Drive file ID from the submitted link.
- The system checks Google Drive MIME type.
- The system accepts only `application/pdf` for PDF-required fields.
- The system blocks Google Docs, Slides, Sheets, non-PDF files, inaccessible files, and files whose type cannot be verified.
- The block message explains that editable links cannot be accepted because the submitted file must be frozen at submission time.
- Blocked non-PDF submissions do not count as submitted attempts for tracker lateness.

### FR-006 Submission Attempt Recording

The system shall record accepted submission attempts in Google Sheets.

Acceptance criteria:

- Each accepted attempt records timestamp, Student Number, Student Name, Team Code, deliverable, submitted links, and source form.
- Resubmissions are always allowed unless a deliverable is manually closed.
- Previous attempts are not overwritten.
- The latest attempt is shown by default, with full attempt history available to Sir/adviser and the submitting student account.

### FR-007 Tracker Lateness Writeback

The system shall write tracker lateness values to Sir's tracker sheet.

Acceptance criteria:

- Lateness is calculated from the first accepted submission attempt timestamp for the student/team and deliverable.
- `0` means on time.
- Positive numbers mean days late.
- The system writes to the configured tracker milestone column.
- Validation and AI flags are written separately and do not change the lateness number unless Teacher/Admin manually corrects it.

### FR-008 Lightweight Automatic Checks

The system shall run lightweight checks after submission.

Acceptance criteria:

- Checks include Drive accessibility, MIME type, basic readability, empty/too-short extracted text, template-like content, and wrong expected file type.
- Checks do not automatically grade academic quality.
- Results are written to Google Sheets as status flags.
- Relevant users can see flags according to role.

### FR-009 AI Evaluation

The system shall provide AI-assisted evaluation as a triage tool.

Acceptance criteria:

- Full AI evaluation is manually triggered only by Teacher/Admin, either for one eligible response or as a selected-deliverable batch.
- The system can summarize document contents.
- The system can flag missing major sections, possible template-only submissions, weak content signals, missing diagrams, and accessibility problems.
- The system can write short results to Sheets.
- The system can create a linked Google Docs report for longer output.
- AI results are advisory and must not be presented as final grading.

### FR-010 Student Status View

The system shall provide optional student account status views.

Acceptance criteria:

- Students see only their own submissions and team-related status.
- Students can see received, checking, inaccessible, not PDF, template-like, needs attention, feedback available, accepted, and archived statuses where applicable.
- Students do not see class-wide tracker data for other teams.

### FR-011 Adviser View

The system shall provide adviser views for assigned teams.

Acceptance criteria:

- Advisers can see assigned teams and deliverables.
- Advisers can see submission attempts, Document Check findings, and feedback history for assigned teams.
- Advisers cannot trigger or rerun AI Review, but they can view existing AI Review reports for assigned teams.
- Advisers can mark review statuses where permitted by Teacher/Admin.

### FR-012 Teacher/Admin Attention Dashboard

The system shall provide a focused dashboard for Sir/Teacher/Admin.

Acceptance criteria:

- Dashboard prioritizes items needing attention.
- Dashboard shows broken links, non-PDF attempts, inaccessible files, template-like files, missing submissions, late submissions, AI-ready files, and archive candidates.
- Dashboard can filter by class, section, team, deliverable, adviser, status, and date.
- Dashboard avoids heavy generic user-management workflows unless necessary.

### FR-013 Final Archive

The system shall archive only final accepted PDF versions.

Acceptance criteria:

- Teacher/Admin or authorized adviser manually selects the final accepted submission for archive.
- The system downloads the final accepted PDF bytes.
- The system stores an independent archive copy outside the student's Drive link.
- The system computes SHA-256.
- The system writes archive metadata to Google Sheets.
- The system may create a Google Drive mirror copy for convenience, but the independent archive copy is the preservation source.
- The system can verify the stored archive hash later.

### FR-014 Archive Index And Retrieval

The system shall maintain an archive index.

Acceptance criteria:

- Archive index includes project title when available, team code, members, adviser, deliverable, source link, archive location, hash, archive date, status, and archived by.
- Teacher/Admin can search archive records.
- Authorized advisers can view archive records for their teams.
- Students may view only authorized final records if enabled.

### FR-015 Activity Log

The system shall log important actions.

Acceptance criteria:

- Logged events include class record sync, deliverable publishing, submission received, tracker writeback, validation flags, AI evaluation, review status changes, archive creation, and hash verification.
- Activity logs are readable by Teacher/Admin.
- Logs must not expose private student data to unauthorized users.

## 7. Non-functional Requirements

### NFR-001 Workflow Fit

The system must fit Sir's Google-first workflow and must not require Sir to manage a heavy separate platform.

### NFR-002 Usability

Student submission must be fast, form-like, and understandable without training.

### NFR-003 Reliability

Submission rows must not be lost. Tracker writeback and validation jobs should be retryable.

### NFR-004 Auditability

The system must retain enough metadata to explain what was submitted, when it was submitted, what was checked, and what was archived.

### NFR-005 Security

The system must restrict role views. Students must not see other students' tracker data. OAuth tokens and API credentials must be stored securely.

### NFR-006 Integrity

Final archives must include SHA-256 hashes and verification records.

### NFR-007 Cost Control

AI evaluation must be controlled through manual trigger, batching, quota, or role-based limits.

## 8. Data Definitions

### Class Record Student

Student Number, Student Name, Team Code, Member Number, Section, Adviser, raw Sheet row reference.

### Deliverable

Title, description, due date, target tracker column, required fields, PDF-required flag, link validation rules, published form slug.

### Submission Attempt

Attempt ID, timestamp, deliverable, Student Number, Team Code, submitted links, notes, accepted/blocked status, validation status, source Sheet row.

### Validation Result

Submission Attempt ID, check type, result flag, message, checked at, raw metadata.

### AI Evaluation

Submission Attempt ID, trigger user, summary, flags, checklist results, confidence, report link, created at.

### Tracker Writeback

Student Number, Team Code, deliverable, tracker column, first accepted matched attempt timestamp, days late value, write status.

### Archive Record

Archive ID, final submission attempt, independent storage location, optional Drive mirror link, SHA-256 hash, metadata, archived by, archived at, verification history.

## 9. Open Items

- Decide final product name.
- Confirm whether Sir wants the independent archive copy stored locally for demo, in institutional storage, or in object storage such as Cloudflare R2.
- Confirm exact short AI columns for the Sheet after Sir sees a sample output.
- Collect real form/template links and decide which fields should be copied exactly.
