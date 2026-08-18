# CapVault V2 Current Batch Actionable Change Instructions

Date captured: 2026-06-18

Identity supersession notice: the login, registration, anonymous submission, and Student Number claim instructions in this historical batch are superseded by `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`.

This document translates the latest feedback into implementation instructions for the next CapVault V2 pass. It is intentionally direct and workflow-focused. The goal is to prevent future implementation from drifting back into a generic portal, generic dashboard, or vague AI feature set.

## Core Direction

CapVault V2 must be a form-first, Google-first workflow assistant for Sir Ralph Laviste's capstone submission process.

The primary workflow is not "students log into a portal first." The primary workflow is:

1. Sir connects his class record Google Sheet.
2. CapVault reads student, team, tracker, and deliverable columns from that Sheet.
3. Sir publishes Google Forms-like submission links from those mapped deliverables.
4. Students submit through simple public links.
5. Submitted data writes back to Google Sheets.
6. Sir and teachers/advisers review submissions, link accessibility, PDF validity, file summaries, tracker status, and archive candidates from a focused dashboard.

Student accounts are optional quality-of-life features, not a required submission gate.

## Clarification: Student Number Selection

The public form Student Number field should be populated from the connected class record. In the normal flow, an invalid Student Number should not be selectable because the selector only contains class-record values.

If the UI supports type-ahead search, it should still behave as a searchable selector, not an unrestricted free-text field. If free text is ever allowed later, unmatched values must be treated as an explicit edge case and surfaced to Sir, but that is not the preferred default.

## 1. Public Form And Student Entry Flow

The public submission form must be the main student entry point.

Actionable instructions:

1. Add a clear header area on public form pages with access to `Sign in`, `Register`, and `Student Dashboard`.
2. Do not hide registration inside the staff/admin app navigation.
3. Make it obvious to students that submitting does not require an account, but an account lets them view their own status later.
4. Keep the submission form visually close to Google Forms: simple, direct, low-friction, and focused on the deliverable.
5. Remove unnecessary submission notes fields from public forms.
6. Remove repeated PDF warnings. Explain the PDF rule once, clearly.
7. Change all public form wording from `Tracker Column` to `Deliverable`.
8. Remove buzzword-heavy labels such as `AI Triage`.
9. Avoid internal wording copied from planning conversations, such as "Google Drive can mirror the file, but it is not the only archive source."

Preferred student public form fields:

1. Student Number: searchable selector populated from class record.
2. Student Name: auto-filled from selected Student Number but still changeable if the design intentionally keeps Google Forms-like editable fields.
3. Team Code: auto-filled from selected Student Number but still changeable if needed.
4. Deliverable: fixed by the published form link or shown as read-only form context.
5. Google Drive PDF link: required for PDF document deliverables.

If a student is logged in, Student Number, Student Name, and Team Code should auto-fill from their claimed class-record identity.

## 2. Student Registration And Login

Registration should be a normal authentication flow, not a sidebar utility.

Actionable instructions:

1. Provide a dedicated login/register screen.
2. Allow Google OAuth registration/login.
3. Allow manual email/password registration/login.
4. During registration, ask only for Student Number from the class-record-backed searchable selector.
5. Do not ask for Student Name or Team Code in registration; those are derived from Student Number.
6. Once a Student Number is claimed by an account, it should disappear from the registration selector for other users.
7. Changing a claimed Student Number should be admin-only.
8. After login, the student should have a clear path to Student Dashboard.
9. The public form header should expose this path so students know the dashboard exists.

## 3. Form Publisher

The Form Publisher must use class-record deliverable columns instead of separate vague labels.

Actionable instructions:

1. Remove `Short Label`.
2. Use the mapped deliverable or tracker column name to generate form titles such as `SRS Submission`.
3. Rename `Tracker Column` to `Deliverable`.
4. Populate the Deliverable selector from connected class record columns.
5. Allow Sir to edit/rename mapped deliverables after Sheet connection.
6. Allow Sir to publish, edit, unpublish/remove, and republish forms.
7. Add a confirmation prompt before removing a published form.
8. Keep edit/remove actions visible without requiring horizontal scrolling.

## 4. Google Sheet Connection And Dynamic Columns

Connecting Sir's Google Sheet must populate the system, not just store a copied URL.

Actionable instructions:

1. Sir must be able to connect a current class record Google Sheet by URL or Sheet ID.
2. CapVault must read the header row and infer likely identity columns:
   - Student name
   - Student number or email, if present
   - Team code/team formation
   - Member number
   - Adviser/teacher fields, if present
3. CapVault must read tracker/deliverable columns dynamically.
4. These columns must populate:
   - Form Publisher deliverable choices
   - Tracker page columns
   - Submission review grouping
   - Tracker update/write fields
5. Sir must be able to manually correct column mappings.
6. Sir must be able to rename or hide columns inside CapVault after import.
7. If Sir adds or changes columns in the Sheet, CapVault should re-sync without breaking existing forms.

## 5. Submission Response Model

Avoid product-facing language around endless `Submission Attempts`.

Actionable instructions:

1. Model the public experience like Google Forms: one response per student per published deliverable form.
2. Students should be able to edit their response.
3. Internally keep response history only when a submitted value actually changes.
4. If a student opens edit mode and changes nothing, do not create a new history entry and do not update tracker lateness.
5. If a student changes any response field after the due date, update tracker lateness based on the latest changed response timestamp.
6. UI should show the current response by default.
7. History can exist as an audit trail, but it should not dominate the review UI.
8. Do not call the main review rows `attempts` unless specifically referring to hidden audit/history records.

## 6. Tracker Page

The tracker must use Sir's language and stay understandable.

Actionable instructions:

1. Rename `Tracker Writeback` to `Tracker`.
2. Remove unclear summary pills such as `Accepted Attempts` and `Unmatched`.
3. Replace them with plain summaries such as:
   - On-time
   - Late
   - Missing
   - Needs Check
   - Updated Today
4. Preserve Sir's tracker meaning:
   - `0` means on time.
   - Positive number means days late.
   - Blank means no accepted response yet, unless Sir maps it otherwise.
5. Tracker update behavior should be based on submitted/edited response timestamps.
6. Student-facing tracker/status views should show only the student's own progress.
7. Teacher/Sir can see all groups under him.
8. Adviser can see assigned teams only.
9. Teacher can also be an adviser and may need both views.

## 7. Student Status Page

The Student Status page should use the same identity lookup pattern as public forms.

Actionable instructions:

1. Student Number lookup should be a searchable selector populated from the class record.
2. It should support fast keyboard search.
3. It should not require students to parse a full class tracker.
4. If logged in, the student's identity should pre-fill.
5. Show only the selected/logged-in student's own submissions, tracker values, file check status, and feedback.

## 8. Command Center And Tables

Tables should not hide primary actions behind horizontal scroll.

Actionable instructions:

1. Redesign the Command Center attention queue so actions are visible without scrolling right.
2. Move row actions near the left side or into a fixed action area.
3. Remove or heavily reduce Recent Activity if it only repeats low-value log entries such as `Submission file check completed`.
4. Avoid dense rows where status pills pile up and force layout shifts.
5. Use a stable status area with a primary state and compact secondary flags.

## 9. Submission Review

Sir must be able to inspect submitted links quickly.

Actionable instructions:

1. Show the submitted Drive link or a clear `Open File` action directly in each review row/detail.
2. Keep review actions aligned and visible.
3. Fix action layout so buttons do not wrap into awkward two-on-top, one-below arrangements.
4. Replace generic `Check File` with a clearer AI-aware label such as `Run AI Check` or `AI Review`.
5. Do not overuse status pills. Use one primary status plus compact flags.
6. Keep row height stable even after checks are added.
7. Group review by current response, with history available secondarily.

## 10. AI File Checking

The AI feature must answer Sir's practical problem: he does not want to open dozens of files only to find dead links, wrong files, blank PDFs, or unchanged templates.

Actionable instructions:

1. AI/checking should not be framed as vague `AI Triage`.
2. Use plain language such as `File Check`, `AI Check`, or `AI Review`.
3. Basic automated checks should happen before or soon after submission:
   - Drive link accessible
   - File is PDF when PDF is required
   - File text can be extracted
   - File is not empty or extremely short
   - File is not obviously just the unchanged template
4. Teacher-triggered AI review should be available from review rows.
5. The AI review should provide quick outputs:
   - Short summary
   - Red flags
   - Missing or weak required sections
   - Whether diagrams/figures appear present when relevant
   - Suggested action
6. The AI should not pretend to be final grading.
7. Students may see basic file flags, but detailed teacher/adviser notes can remain staff-only.
8. The design should take useful patterns from the IEEE Docs Evaluator:
   - Manual run/re-run
   - Progress states
   - Extract Drive/PDF content
   - Store evaluation history
   - Allow teacher instructions/templates/rubrics
   - Provide readable report output

## 11. Document Template Management

Template-like detection requires Sir to provide official templates.

Actionable instructions:

1. Add a place for Sir to upload or link official templates per deliverable.
2. Store template metadata:
   - Deliverable
   - Template name
   - Drive link or uploaded file
   - Extracted text snapshot
   - Active/inactive state
3. Use the stored template for similarity checks.
4. Detect template-like submissions by comparing submitted PDF text against official template text.
5. Look for unchanged placeholder/instruction text.
6. Look for very low student-added content after removing template boilerplate.
7. Use AI only as a second-pass helper for ambiguous cases or deeper review.

## 12. Google APIs

Google API usage should be concrete and visible in the design.

Actionable instructions:

1. Google Sheets API:
   - Read class record rows and columns.
   - Populate student selectors and deliverables.
   - Write submission responses.
   - Write tracker lateness values.
   - Write compact check results if Sir wants them in Sheets.
2. Google Drive API:
   - Verify submitted links.
   - Read file metadata.
   - Check MIME type.
   - Download/export file content for validation and AI review.
   - Copy or preserve final archive files.
3. Google Docs API:
   - Only needed if CapVault creates long Google Docs review reports or archive notes.
   - Do not mention Google Docs reports in the UI unless there is an actual user-facing flow for creating/opening them.

## 13. PDF-Only Rule

Sir wants PDF submissions for document deliverables because editable Google Docs links can be changed after submission.

Actionable instructions:

1. Strictly block Google Docs, Slides, Sheets, and other editable Workspace links for PDF-required deliverables.
2. Verify file type with Google Drive API MIME metadata.
3. Do not rely only on URL text.
4. Show one clear error message when blocked:
   - `This deliverable requires a PDF Drive link. Editable Google Docs, Slides, or Sheets links cannot be submitted.`
5. Avoid repeating the same warning multiple times on the form.

## 14. Archive

Archiving is not the main daily workflow. It happens near the end of the semester for final versions.

Actionable instructions:

1. Archive only final accepted documents unless Sir decides otherwise.
2. Use the submitted Sheet links as the source list for archive candidates.
3. Preserve an independent copy of the final file so the archive is not dependent on a student's Drive link remaining unchanged or accessible.
4. Google Drive can be used as archive storage if Sir accepts Drive folders as the archive destination.
5. If a stronger independent archive is needed, use the previous file-preservation architecture or another controlled storage backend.
6. Keep historical submitted links during the semester.
7. Allow Sir to manually clear/delete semester submission history when the semester ends.

## 15. Workspace Page

The Workspace page should not claim features that do not have flows.

Actionable instructions:

1. If Google Docs reports are not implemented, remove or soften claims about longer Google Docs file checks.
2. Replace implementation-sounding labels with user workflow labels.
3. Make Sheet connection, column mapping, template setup, and archive destination setup the main workspace configuration tasks.

## 16. UI Language And Tone

The app should sound like a practical academic tool, not a planning document or AI startup demo.

Actionable instructions:

1. Remove jargon such as `AI Triage`, `Tracker Writeback`, `Accepted Attempts`, and `Unmatched` unless a specific user understands and needs those terms.
2. Use Sir-facing labels:
   - Forms
   - Deliverables
   - Tracker
   - File Check
   - AI Review
   - Submissions
   - Archive
3. Do not expose internal architecture decisions in helper text.
4. Avoid repetitive warnings.
5. Keep buttons visible, aligned, and comfortably padded.
6. Use tables only where they help scanning; otherwise use grouped rows or split panels.

## 17. Student Dashboard View

There must be a way to preview and access the Student Dashboard.

Actionable instructions:

1. Add a clear Student Dashboard route.
2. Link it from public form header after login/register.
3. Provide a staff/dev preview control if needed during demo.
4. Dashboard should show:
   - Student identity
   - Team code
   - Published deliverables
   - Submitted/not submitted state
   - Current file check flags
   - Tracker values for their own row
   - Feedback if available
5. Do not show other students' tracker rows.

## Implementation Reminder For Future Pass

Before implementing, use this document as the checklist for the next V2 correction pass. Do not silently simplify these requirements. If any item is too large, ask what to defer.
