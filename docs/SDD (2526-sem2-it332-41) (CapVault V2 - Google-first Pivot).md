# Software Design Description

## CapVault V2: Google-first Capstone Submission, Tracking, Document Check, AI Review, and Archive System

Status: Draft source-of-truth for the V2 pivot  
Date: 2026-06-18  
Primary user: Sir Ralph Laviste  
Working product name: CapVault, pending rename discussion

Identity amendment, 2026-08-19: `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` supersedes this draft's anonymous-submission, optional student account, password registration, OTP, and pre-matched Gmail assumptions. Until this SDD is fully revised, use the amendment for all student identity, dashboard access, response ownership, and draft behavior.

Sheet-mapping amendment, 2026-08-19: fixed assumptions such as `first three columns are labels and every later column is a deliverable` are superseded. Use source-specific required keys, header/value-based suggestions, dynamic milestone and deadline detection, explicit import diagnostics, and user-correctable mappings. The confirmed details are recorded in `docs/CapVaultV2_Post_Demo_Debrief_And_Completion_Roadmap.md`.

Submission-lifecycle amendment, 2026-08-19: due dates determine tracker lateness but do not automatically close or unpublish forms. A response that passes identity, required-field, accessibility, downloadability, and PDF preflight remains a submitted attempt even when later Document Check flags blank, short, incomplete, or template-like content. See `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` Sections 8 and 14.

File-snapshot amendment, 2026-08-19: an unchanged Drive URL is not treated as immutable content. Accepted PDFs receive immutable metadata and SHA-256 snapshots. Changed bytes under the same Drive file ID create version events, invalidate stale checks/reviews, and recalculate canonical tracker lateness from the later material-save/Drive-modified time. See `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md` Section 14.3.

## 1. Design Goals

CapVault V2 is designed as a Google-first workflow assistant, not a replacement portal. The system should help Sir Ralph manage capstone submissions across classes while keeping Google Sheets and Google Drive at the center of the workflow.

Primary design goals:

- Keep student submission form-like and login-free.
- Use the class record Sheet as the source for identity and tracker mapping.
- Write essential submission and tracker data back to Sheets.
- Prevent editable document links from counting as document submissions.
- Reduce manual document checking through automatic Document Check and controlled Admin-only AI Review.
- Archive only final accepted PDFs as independent byte copies with hashes.
- Keep role-specific surfaces narrow and useful.

## 2. System Context

CapVault V2 interacts with:

- Google Sheets for class records, submission history, tracker writeback, validation flags, AI summaries, archive index, and activity logs.
- Google Drive for submitted PDF metadata, access checks, final PDF download, and optional mirror copies.
- Google Docs for longer AI reports where Sheet columns are too small.
- OAuth provider for staff/admin/adviser login and optional student accounts.
- AI provider for controlled document triage and summary generation.
- Optional GitHub API for repository metadata checks.

Students interact mainly with generated submission links. Sir/teacher/adviser users interact with dashboards, review queues, and archive actions.

## 3. High-level Architecture

The architecture shall be modular and service-based.

### 3.1 Frontend

Recommended stack:

- React + Vite.
- Route-based pages.
- Form-focused student submission experience.
- Staff dashboard and review views.

Suggested frontend structure:

- `src/app/` for route setup and app providers.
- `src/pages/public/` for generated submission forms.
- `src/pages/staff/` for Sir/teacher dashboards.
- `src/pages/adviser/` for adviser views.
- `src/pages/student/` for optional student account views.
- `src/components/forms/` for submission form sections.
- `src/components/google/` for Sheet/Drive connection UI.
- `src/components/review/` for flags, AI summaries, and review actions.
- `src/components/archive/` for archive status, hash checks, and records.
- `src/lib/api/` for typed API clients.
- `src/lib/format/` for date, status, and tracker formatting.

### 3.2 Backend

Recommended stack:

- Spring Boot + Java 21.
- Controller/service/repository layering.
- PostgreSQL for internal state where needed.
- Google APIs for Sheets/Drive/Docs integration.
- Background jobs for Document Check, Admin-triggered AI Review, tracker writeback, and archive capture.

The backend should act as the automation layer. It should not try to become the primary class record.

### 3.2.1 Document Check and AI Review Boundary

Document Check is deterministic and uses Google Drive metadata, temporary PDF download, PDF text extraction, and official-template comparison. It runs after a new or materially changed response and may also be run in limited-concurrency batches. The downloaded submission bytes are discarded after inspection.

AI Review is generative and separate. It is available only to Admin/Sir from Admin Review, runs only on explicit individual or selected-deliverable batch request, and consumes the readable document/template data prepared by the backend. Advisers can use Document Check results but cannot invoke AI Review.

### 3.3 Storage Strategy

Google Sheets is the visible shared data graph.

PostgreSQL can store:

- Connected class record configuration.
- OAuth connections.
- Generated form slugs.
- Internal job state.
- Optional account mappings.
- Cached Sheet row references.
- Archive metadata cache.

Google Sheets stores:

- Submission rows.
- Tracker writeback values.
- Status flags.
- AI summary columns.
- Archive index.
- Activity rows.

Archive storage stores:

- Independent final accepted PDF bytes.
- SHA-256 hash.
- Optional manifest/metadata JSON.

For local/demo use, archive storage can be a local filesystem folder. For production, use institutional storage or object storage such as Cloudflare R2. A Google Drive mirror copy may be created for convenience but must not be the only archive copy.

## 4. Core Components

### 4.1 ClassRecordService

Responsibilities:

- Connect to a class record Sheet.
- Read configured sheet ranges.
- Normalize student/team/adviser records.
- Preserve raw tracker values.
- Attempt to resolve Student Number to Student Name, Team Code, Member Number, Section, and Adviser.
- Provide target tracker row/column references for writeback.

Dependencies:

- GoogleSheetsClient.
- ClassRecordConfigRepository.

### 4.2 DeliverableService

Responsibilities:

- Create and update deliverable definitions.
- Generate public form slugs.
- Map deliverables to tracker milestone columns.
- Define required fields and validation rules.
- Store PDF-required settings.

Dependencies:

- DeliverableRepository.
- ClassRecordService.

### 4.3 PublicSubmissionService

Responsibilities:

- Load published deliverable forms.
- Look up Student Number in the class record when possible.
- Auto-fill identity data when a class record match is found.
- Allow anonymous submission to continue when Student Number is unmatched, while flagging the attempt for staff review.
- Validate required fields.
- Enforce PDF-only rules before accepted submission.
- Record accepted attempts.
- Trigger tracker writeback and background validation jobs.

Dependencies:

- DeliverableService.
- ClassRecordService.
- DriveValidationService.
- SubmissionSheetWriter.
- TrackerWritebackService.
- ValidationJobQueue.

### 4.4 DriveValidationService

Responsibilities:

- Extract Google Drive file IDs from links.
- Fetch file metadata through Drive API.
- Detect MIME type.
- Verify PDF status.
- Verify accessibility.
- Download final accepted PDF bytes during archive.
- Capture metadata such as name, size, modified time, and web view link.

PDF-required validation:

- Accept only MIME type `application/pdf`.
- Block Google Workspace MIME types such as Docs, Slides, and Sheets.
- Block inaccessible or unverifiable links.

### 4.5 SubmissionSheetWriter

Responsibilities:

- Append accepted submission attempts to the Submission Responses Sheet.
- Preserve every attempt row.
- Write source link values and extracted Drive file IDs.
- Write validation and AI status columns.
- Maintain latest-attempt references where useful.

### 4.6 TrackerWritebackService

Responsibilities:

- Calculate days late from due date and first accepted submission attempt.
- Write `0` for on-time attempts.
- Write positive day counts for late attempts.
- Write to the mapped tracker column in Sir's class record.
- Preserve raw values where the tracker cell has non-standard content unless overwrite is explicitly allowed.
- Log writeback events.

Important rule:

For PDF-required deliverables, non-PDF links are blocked before accepted submission and therefore do not count as attempts. For accepted matched submissions, tracker lateness is based on the first accepted matched attempt timestamp, not AI quality or later review outcome. Unmatched anonymous submissions are recorded but do not write tracker lateness until staff resolves the identity.

### 4.7 LightweightValidationJob

Responsibilities:

- Run after accepted submission.
- Check accessibility again if needed.
- Extract text from PDF where possible.
- Detect empty or too-short content.
- Compare against known templates when templates are provided.
- Write flags to Sheets.
- Notify relevant dashboards.

### 4.8 AiEvaluationService

Responsibilities:

- Run only when manually triggered or selected-deliverable batch-triggered by Teacher/Admin.
- Extract document text and relevant metadata.
- Generate short summary.
- Flag missing major sections, weak content signals, missing diagrams, template-like content, and accessibility issues.
- Write short output to Sheets.
- Create optional Google Docs report for long output.
- Track evaluation history.

Design rule:

AI evaluation is advisory triage. It is not the final grade.

### 4.9 ReviewService

Responsibilities:

- Provide review queues by role.
- Record review remarks and status.
- Mark accepted/final submissions.
- Select final accepted attempt for archive.

### 4.10 ArchiveService

Responsibilities:

- Archive only final accepted PDFs.
- Download independent PDF bytes from Drive.
- Store bytes in configured archive storage.
- Compute SHA-256.
- Write archive metadata to Sheets.
- Create optional Drive mirror copy.
- Verify stored archive hash later.

Dependencies:

- DriveValidationService.
- ArchiveStorage.
- ArchiveSheetWriter.
- HashService.

### 4.11 NotificationService

Responsibilities:

- Create in-app notifications first.
- Support later email notifications.
- Notify students with optional accounts about accessibility/content flags.
- Notify Sir/advisers about items needing attention.

### 4.12 GitHubMetadataService

Responsibilities:

- Check repository accessibility.
- Read default branch.
- Read last push date.
- Check README presence.
- Count recent commits.
- Write metadata flags to Sheets/dashboards.

## 5. Main Workflows

### 5.1 Class Record Setup

1. Teacher/Admin connects a Google Sheet class record.
2. CapVault reads class record sheets/ranges.
3. Teacher/Admin maps columns if automatic detection is uncertain.
4. CapVault stores mapping and Sheet IDs.
5. CapVault can refresh records when Sir updates the Sheet.

### 5.2 Deliverable Form Publishing

1. Teacher/Admin creates a deliverable.
2. Teacher/Admin selects tracker milestone column.
3. Teacher/Admin sets due date.
4. Teacher/Admin adds required fields.
5. Teacher/Admin marks document fields as PDF-required where applicable.
6. CapVault creates a public form slug.
7. Sir shares the generated link.

### 5.3 Student Submission

1. Student opens generated deliverable link.
2. Student enters Student Number.
3. CapVault attempts to match Student Number against the class record.
4. If a match is found, CapVault auto-fills Student Name, Team Code, Member Number, Section, and Adviser where available.
5. Student pastes required links.
6. For PDF-required fields, CapVault uses Drive metadata to verify MIME type before accepting.
7. Non-PDF, editable, inaccessible, or unverifiable links are blocked.
8. Accepted attempts are written to Sheets.
9. Tracker lateness is written from the first accepted matched attempt.
10. Lightweight checks continue in the background.

### 5.4 Validation And AI Triage

1. Background validation checks accepted submissions.
2. Flags are written to Sheets.
3. Sir and adviser dashboards highlight Document Check attention items within their role scope.
4. Only Sir/Admin manually triggers individual or selected-deliverable batch AI Review when needed.
5. AI short result is written to Sheets.
6. Optional long report is written to Google Docs.

### 5.5 Review

1. Sir/adviser opens attention dashboard.
2. Sir/adviser filters by class, deliverable, team, adviser, or status.
3. Sir/Admin reads Document Check findings and AI summaries; advisers read Document Check findings only.
4. Sir/adviser opens original submitted link only when needed.
5. Sir/adviser records remarks/status.
6. Sir/adviser marks final accepted version when ready.

### 5.6 Final Archive

1. Sir/adviser selects final accepted submission.
2. CapVault downloads final PDF bytes from Drive.
3. CapVault stores the independent archive copy.
4. CapVault computes SHA-256.
5. CapVault writes archive index row to Sheets.
6. CapVault optionally mirrors the file to a controlled Drive folder.
7. CapVault can verify the stored hash later.

## 6. Data Model

### 6.1 Internal Tables

`connected_class_records`

- id
- google_sheet_id
- name
- owner_user_id
- mapping_json
- active
- last_synced_at

`student_account_links`

- id
- user_account_id
- student_number
- class_record_id
- verified_at
- verified_by

`deliverables`

- id
- class_record_id
- title
- description
- due_at
- tracker_column_key
- public_slug
- status
- field_schema_json

`submission_attempt_cache`

- id
- deliverable_id
- student_number
- team_code
- submitted_at
- sheet_row_id
- latest_status
- validation_summary_json

`validation_jobs`

- id
- submission_attempt_id
- job_type
- status
- attempts
- last_error
- created_at
- finished_at

`ai_evaluations`

- id
- submission_attempt_id
- triggered_by
- status
- summary
- flags_json
- report_doc_id
- created_at

`archive_records`

- id
- submission_attempt_id
- storage_key
- optional_drive_mirror_id
- sha256
- size_bytes
- metadata_json
- archived_by
- archived_at

`hash_checks`

- id
- archive_record_id
- expected_sha256
- actual_sha256
- result
- checked_at
- checked_by

### 6.2 Google Sheet Tabs

Recommended tabs:

- `Students`
- `Groups`
- `Advisers`
- `Tracker`
- `Deliverables`
- `Submission Responses`
- `Validation Results`
- `AI Evaluation Results`
- `Archive Index`
- `Activity Log`

The exact tab names may be mapped to Sir's existing class record instead of forcing new names.

## 7. Status Flags

Recommended initial flags:

- `Received`
- `PDF OK`
- `Not PDF`
- `Editable Link`
- `Inaccessible`
- `Unreadable`
- `Too Short`
- `Template-like`
- `Needs Review`
- `AI Checked`
- `Accepted`
- `Archived`

Flags should be readable in Sheets and dashboards. They should be configurable later, but the first version can use a fixed controlled list.

## 8. Error Handling

### 8.1 Student-facing Errors

Errors must be specific and recoverable.

Examples:

- "Student Number was not found in the class record. Your submission can still be sent, but it will be flagged for staff review."
- "This deliverable requires a PDF. Google Docs links cannot be accepted because they remain editable after submission."
- "CapVault cannot access this Drive link. Please set sharing to anyone with the link or submit a different PDF link."
- "This field is required."

### 8.2 Staff-facing Errors

Staff errors must include enough context for troubleshooting:

- Sheet ID/range.
- Deliverable.
- Student Number.
- Drive file ID.
- Job ID.
- API error category.
- Suggested retry action.

### 8.3 Retries

Retryable jobs:

- Sheet append/writeback.
- Validation checks.
- AI evaluation.
- Archive download/store.
- Hash verification.

Non-retryable student submission blocks:

- Missing required fields.
- Non-PDF link for PDF-required field.
- Inaccessible/unverifiable link for PDF-required field.

## 9. Access Control

### Student Without Account

Can submit through public deliverable links without account registration. Student Number is used for class-record lookup and auto-fill when possible, but unmatched Student Numbers do not block submission by themselves. Cannot view dashboards.

### Student With Account

Can view own submissions, own status flags, own feedback, and allowed team status.

### Adviser

Can view assigned teams, submissions, flags, AI summaries, feedback, and review actions allowed by Teacher/Admin.

### Teacher/Admin

Can manage class record connection, deliverables, mappings, tracker writeback, dashboards, AI triggers, review status, archive actions, and user/account resolution.

## 10. UI Design Direction

Student submission should be calm, familiar, and form-like. It should not look like an admin dashboard.

Teacher/Admin dashboard should be operational and attention-focused. It should answer:

- What needs checking?
- What links are broken?
- Which submissions are late or missing?
- Which files are not PDFs?
- Which files look empty or template-like?
- Which groups need review?
- Which final submissions are ready to archive?

Adviser views should show only assigned teams and review tasks.

Student optional account views should be simple:

- My submissions.
- My status.
- My feedback.
- My team progress if enabled.

## 11. Legacy Handling

The existing CapVault V1 app shall be preserved as a legacy branch/tag. V2 should not be built by slowly bending the V1 portal into the new workflow.

Reusable V1 concepts:

- Google Sheets integration.
- Class record column knowledge.
- Tracker field mapping concepts.
- Archive hashing idea.
- Some dashboard/status ideas.

Do not carry forward:

- Login-first student submission.
- Heavy portal-first UX.
- Requirement to manage every user before submission.
- Archive-every-version assumption.
- Local-only storage as the visible workflow.

## 12. Testing Strategy

### Unit Tests

- Student Number resolver.
- Drive file ID extraction.
- MIME type decision logic.
- PDF-required validation.
- Days-late calculation.
- Status flag derivation.
- Hash computation.

### Integration Tests

- Class record read/mapping.
- Submission row append.
- Tracker writeback.
- Validation result write.
- Archive index write.

### End-to-end Tests

- Teacher publishes deliverable.
- Student submits valid PDF.
- Student is blocked for Google Docs link.
- Submission writes to Sheet.
- Tracker writes `0` or days-late value.
- Validation flags appear.
- Sir triggers AI evaluation.
- Sir archives final accepted PDF.
- Hash verification passes.

## 13. Deployment Notes

Local/demo profile:

- Local backend.
- Local frontend.
- Google API credentials for Sheets/Drive/Docs.
- Local archive storage folder.
- Optional local database.

Production-like profile:

- Hosted backend.
- Hosted frontend.
- PostgreSQL.
- Google OAuth and Workspace API credentials.
- Object storage or institutional storage for independent archive bytes.
- Secure secret management.

## 14. Open Design Items

- Final product name.
- Exact archive storage target for production.
- Exact Sheet tab/column format from Sir's final class record.
- Exact AI short columns and long report template.
- Whether email notifications are added after in-app notifications.
