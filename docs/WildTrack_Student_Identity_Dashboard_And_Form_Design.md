# WildTrack Student Identity, Dashboard, and Form Design

Date: 2026-08-19

Status: Approved direction with the remaining decisions in Section 12 still requiring confirmation before implementation.

This document supersedes earlier CapVault V2 requirements that describe anonymous submission, manual email/password registration, optional student accounts, OTP verification, or a pre-collected personal Gmail column in Team Formation.

## 1. Product Intent

WildTrack should preserve the direct feeling of Sir Ralph's Google Forms workflow while recording enough Google identity information to make each response accountable.

Students must not create or maintain a separate WildTrack username and password. They should open a deliverable link directly, use the Google account already active in their browser when possible, and complete the form with minimal interruption.

The approved model is **Google-attributed, self-declared student identity**. It is not cryptographic proof that the Google account owns the selected Student Number.

## 2. Confirmed Identity Decisions

1. Personal Gmail addresses will not be collected in advance from hundreds of students.
2. Team Formation does not need a Personal Gmail column.
3. Students do not authenticate through their Microsoft-hosted `cit.edu` account.
4. Student OTP verification is not part of the current flow.
5. WildTrack does not provide student username/password registration.
6. Google Identity Services supplies the Google identity used for submissions and dashboard access.
7. Any Google account may begin the student flow. The first student-record association is self-declared.
8. WildTrack must not label that association as `verified`. Internally, it should be recorded as `SELF_DECLARED` so stronger verification can be added later without redesigning the data model.
9. An internal WildTrack user/profile record may be created automatically after Google authentication. This is implementation detail, not a registration task shown to the student.

## 3. Public Form Entry

1. A student opens a published deliverable link directly.
2. The form page loads immediately. There is no separate WildTrack login or registration page blocking access to the form.
3. Google One Tap attempts to identify an active Google account.
4. If automatic identification is unavailable, the page shows a compact `Continue with Google` action.
5. If more than one Google account is available or the wrong account was selected, the student can use `Switch account`.
6. The form clearly displays the active Google email before final submission.

Suggested disclosure:

> Signed in as **student@gmail.com**  
> Your Google account is recorded with this submission and is visible to authorized staff.

WildTrack must not copy Google Forms wording such as `Not shared` or claim that the Google identity is not part of the response. The Google identity is deliberately retained as audit metadata.

## 4. First Student-Record Connection

The first form acts as onboarding. A separate student registration page is not required.

1. An unlinked Google identity selects a Student Number from the current form's academic workspace.
2. The selector is populated only from that workspace's imported Team Formation records.
3. WildTrack derives Student Name, Team Code, Member Number, course/section, and adviser from the selected record.
4. Before submission, the student sees a clear identity confirmation containing the selected student record and active Google email.
5. The confirmation explains that WildTrack will remember this pairing for future forms and dashboard visits.
6. A successful first-time identity confirmation, whether reached from a form or the dashboard, creates a workspace-scoped, self-declared association between the Google identity and student record.

The association is workspace-scoped because one installation can contain separate IT and CS workspaces and multiple academic terms. A Google identity may have a different enrollment record in a future workspace without corrupting historical data.

## 5. Returning Student Form Experience

1. Google One Tap or the existing WildTrack session identifies the returning student.
2. WildTrack loads the remembered student record for the form's workspace.
3. Student Number, name, team, member number, and related roster data are filled automatically.
4. The page still shows which Google email and student record will be attached to the response.
5. Changing the student record is not presented as an ordinary editable input. It uses an explicit `Use a different student record` action and confirmation to reduce accidental reassignment.
6. Switching Google accounts reruns identity lookup for the current workspace.

## 6. Student Dashboard Access

1. Students reach the dashboard through a visible `Student Dashboard` entry point.
2. Google One Tap opens the dashboard automatically for recognized returning users when browser and Google conditions allow it.
3. `Continue with Google` is the fallback entry action.
4. There is no separate student Register page, password field, password reset, or manual email login.
5. If the Google identity has no student-record association, the dashboard shows the same first-time Student Number connection flow used by the public form.
6. The dashboard provides `Switch Google account` and `Sign out` actions.
7. A self-declared Student Number connection exposes only the matched roster identity and records owned by the same Google identity.
8. Google-identity-owned records include that account's submissions, response history, Document Check results, permitted AI Review results, and adviser feedback attached to those submissions.
9. A self-declared connection does not unlock imported private tracker history, submissions, Drive links, feedback, or review results belonging to another Google identity, even when those records use the same Student Number.

## 7. Draft Autosave

1. WildTrack begins autosaving only after the student changes a form field.
2. Drafts are stored by form, workspace, and Google identity.
3. Drafts are private to the same Google identity.
4. Drafts may be restored on another device after the student uses the same Google account.
5. Abandoned drafts expire after approximately 30 days.
6. A student may clear an unfinished draft deliberately.
7. A draft is not a submission.
8. Draft creation and updates do not change tracker lateness, create a submission notification, run Document Check, or start AI Review.
9. The interface may show a quiet `Draft saved` state, but it should not interrupt form completion with a large explanatory modal.

## 8. Submission and Edit-Response Ownership

1. A submitted response stores the backend-validated Google provider identifier (`sub`), Google email snapshot, selected student record, workspace, deliverable, submitted fields, and timestamps.
2. The Google `sub` value, not an editable email string, is the stable external identity key.
3. One Google identity has one active response per published deliverable form.
4. The same Google identity can reopen and edit its response.
5. Edit mode pre-fills the previously submitted fields.
6. Merely opening or closing Edit Response does not change the response timestamp or tracker.
7. A materially changed saved response records a new history event and follows the established tracker lateness rule for changed responses.
8. Another Google identity must never overwrite the response merely by selecting the same Student Number.
9. Submitted Drive links and previous response fields must never be exposed to a different Google identity through Student Number selection alone.

## 9. Document Check and AI Boundaries

1. Draft autosave does not call Document Check or AI Review.
2. Submission preflight may validate the Drive link, accessibility, and required PDF type before accepting the response.
3. Deterministic Document Check runs after the identity and submission requirements are satisfied, according to the finalized synchronous/background processing design.
4. AI Review remains a separate Sir/Admin-controlled operation. Only Sir/Admin can trigger individual or batch AI Reviews.
5. Assigned advisers may view an existing AI Review for their authorized teams but cannot run or rerun it.
6. Students do not see AI Review output on the Student Dashboard.
7. Students see permitted deterministic Document Check results, submission status, and adviser feedback attached to their account-owned submissions.
8. Adviser feedback is manually authored communication and is not a second or rewritten AI Review.
9. Google sign-in does not grant WildTrack access to the student's private Drive. Submitted files must still satisfy the configured Drive-sharing and accessibility rules.

## 10. Staff Visibility and Audit

Authorized staff should be able to see:

- The Student Number, student name, team, and workspace attached to the response.
- The Google email used for the response.
- The stable internal Google identity reference where needed for audit and conflict detection.
- Submission and material edit timestamps.
- Student-record changes associated with the Google identity.
- Identity conflicts, such as multiple Google identities using the same Student Number in one workspace.

The normal review queue should not become cluttered with identity administration. Conflict information should appear only when an actual conflict exists.

## 11. Future Verification Upgrade

The data model should preserve an identity-assurance field such as:

- `SELF_DECLARED`
- `VERIFIED_INSTITUTIONAL_EMAIL`
- `STAFF_CONFIRMED`

The current approved flow creates `SELF_DECLARED` associations only. A future OTP, Microsoft identity, LMS connection, or staff-confirmation mechanism can raise the assurance level without replacing Google login, submission ownership, drafts, or dashboard navigation.

## 12. Remaining Decisions Before Implementation

### 12.1 Confirmed Dashboard Privacy Boundary

A self-declared connection unlocks only the matched roster identity and records owned by the same Google identity. It does not unlock complete imported tracker history or private records associated only through the selected Student Number.

This preserves dashboard privacy without requiring OTP. If stronger verification is added later, verified students may be allowed to merge or view eligible historical tracker records through a separate policy.

### 12.2 Duplicate Google Identities for One Student Number

Confirmed decision: a second Google identity may use a Student Number already associated with another Google identity.

WildTrack must:

1. Allow the second account to submit instead of blocking the student.
2. Create a separate account-owned response rather than overwriting the first account's response.
3. Prevent either Google identity from viewing the other identity's submitted fields, Drive links, drafts, feedback, or private results.
4. Record an identity-conflict flag containing the workspace, Student Number, involved Google identity references, and timestamps.
5. Show the conflict to authorized staff in the relevant student/submission context without adding identity-administration noise to every normal review row.
6. Preserve both histories so a later correction does not destroy evidence of what occurred.

This prevents a mistaken or malicious first association from locking the real student out.

### 12.2.1 Confirmed Tracker Rule for Identity Conflicts

1. The first accepted response for a Student Number and deliverable becomes the canonical tracker source.
2. A later response from a conflicting Google identity is preserved and flagged but does not silently replace the tracker value.
3. A material edit to the canonical response follows the established Edit Response lateness rule and may update the tracker timestamp/value.
4. Opening Edit Response without saving a material change does not affect the tracker.
5. Authorized staff may explicitly choose another preserved response as canonical when correcting a real identity mistake.
6. Changing the canonical response is an audited correction, not an automatic side effect of a later conflicting submission.

### 12.3 Staff and Adviser Google Enrollment

Confirmed decision: staff roles use a small, explicit Google-account allowlist.

1. The first Sir/Teacher/Admin Google email is configured through a protected backend environment setting.
2. After Google authentication, the backend validates the Google token and grants the bootstrapped identity its configured staff roles.
3. Sir manages later staff access through a compact Staff Access surface containing staff name, Google email, roles, workspaces, and assigned teams.
4. Adviser and teacher roles are never self-declared.
5. An unknown Google identity receives no staff permissions.
6. After the first successful allowlisted login, WildTrack binds the staff profile to the backend-validated Google `sub` identifier.
7. Software Project Monitoring adviser names may be mapped to the corresponding staff profile once, rather than requiring a separate account-management process for every student.
8. One staff identity may hold multiple roles, including Teacher/Admin and Adviser, and may switch among its authorized views.
9. Removing staff access revokes application authorization without changing or deleting the person's Google account.

This is intentionally small-scale user management for a limited number of teachers and advisers. It is not a general-purpose account administration module.

### 12.4 Durable Draft and Submission Source of Truth

Confirmed decision: WildTrack uses a split source-of-truth model.

Google Sheets remains authoritative for imported and Sir-maintained academic records:

- Team Formation and roster data.
- Existing Tracker values and milestone columns.
- Software Project Monitoring metadata.
- Deadlines and other records Sir intentionally maintains in Sheets.

PostgreSQL is authoritative for WildTrack-created application records:

- Google identities and sessions.
- Workspace-scoped student associations and identity conflicts.
- Staff allowlists, roles, and adviser assignments maintained in WildTrack.
- Autosaved drafts and expiration state.
- Submitted responses, material edit history, and response ownership.
- Document Check and AI Review records.
- Feedback, acceptance, activity/audit events, notifications, and archive jobs.

WildTrack mirrors the essential operational fields Sir needs back to Google Sheets, including submission rows, tracker lateness, validation/review summaries, and archive index metadata where configured.

Remote Sheet writes use a durable outbox/queue:

1. The PostgreSQL transaction commits the response and pending write event together.
2. A background worker writes the configured values to Google Sheets.
3. Successful writes record the target Sheet, range/row, and completion timestamp.
4. Failed writes remain queued with an error and retry state.
5. The interface must distinguish `Saved in WildTrack` from `Synced to Google Sheets` and must never claim a remote update that did not occur.

Google Sheets must not be used as storage for sessions, private drafts, response ownership, concurrency control, or immutable edit history.

## 13. Explicitly Rejected Behaviors

- Requiring Sir to gather hundreds of personal Gmail addresses before students can use WildTrack.
- Requiring students to create a WildTrack password.
- Requiring Microsoft or `cit.edu` login in the current flow.
- Requiring OTP before submission in the current flow.
- Treating a typed email address as proof of ownership.
- Calling a self-declared Student Number association verified.
- Letting Student Number selection expose another Google identity's submitted Drive link or private response.
- Letting drafts update the tracker or appear as completed submissions.

## 14. Confirmed Form Availability and Submission-Quality Rules

### 14.1 Deadlines Do Not Close Forms

1. A published deliverable form remains available after its due date.
2. Reaching the due date does not automatically unpublish, hide, or close the form.
3. Students may submit after the due date; the accepted response is recorded as late using the configured lateness calculation.
4. Sir/Admin may explicitly unpublish a form when submissions genuinely need to stop.
5. Unpublishing is an administrative availability action, not an automatic deadline consequence.
6. Existing responses and histories survive unpublishing and later republishing.
7. Form status must distinguish `Published`, `Unpublished`, and deadline state such as `Due`, `Due soon`, or `Past due` without treating `Past due` as closed.

This matches Sir's stated workflow: the due date determines whether a submission is on time or late, while the published state determines whether the form accepts responses.

### 14.2 File Validity Is Separate From Document Quality

A response may be committed when the required submission gate succeeds:

- Google identity is present.
- A workspace Student Number is selected and confirmed.
- Required form fields are complete.
- The submitted Drive link is accessible and downloadable.
- A PDF-required field points to an actual readable PDF rather than an editable Google Doc, DOCX, Sheet, Slide, or unsupported file.

After commitment, Document Check may flag the PDF as mostly blank, template-like, too short, missing expected headings, or otherwise requiring review. Those quality findings do not erase the submission or its tracker attempt. They affect review status and expected score/feedback, not submission existence.

If the student corrects the work after the deadline, they edit the same account-owned response and submit the replacement PDF link. A material edit updates response history and follows the established late-edit tracker rule. Opening Edit Response without saving a material change has no effect.

The purpose of strict PDF preflight is to prevent a student from submitting an editable document before the deadline and silently completing its content later without producing a recorded response change.

### 14.3 Same-Link PDF Replacement Detection

A Google Drive PDF link is not inherently immutable. A file owner may upload a new version while retaining the same Drive file ID and URL. WildTrack must therefore fingerprint submitted PDF bytes rather than assuming an unchanged link means unchanged content.

For every accepted PDF submission, WildTrack stores an immutable file snapshot containing:

- Google Drive file ID.
- Submitted URL snapshot.
- MIME type.
- File size.
- Drive `modifiedTime`.
- WildTrack-calculated SHA-256 hash of the downloaded bytes.
- Snapshot/check timestamp.
- Response and response-history event that produced the snapshot.

Revalidation occurs:

1. During initial submission preflight.
2. After a material Edit Response save.
3. Before AI Review.
4. Before staff acceptance.
5. Before final archive capture.
6. When staff runs `Check again` or a batch Document Check.
7. Through an optional scheduled recheck for active deliverables when API limits and deployment resources allow it.

Revalidation rules:

1. A changed Drive timestamp with the same SHA-256 is a metadata-only change and does not alter lateness.
2. A changed SHA-256 means the file contents changed, even when the Drive URL and file ID stayed the same.
3. WildTrack preserves the previous snapshot and creates a new file-version event. It never overwrites the earlier fingerprint.
4. Existing Document Check and AI Review results become outdated when the content hash changes.
5. Document Check reruns against the new bytes.
6. The effective material-submission time becomes the later of the response's material-save timestamp and the changed file's Drive `modifiedTime`.
7. If the response is the canonical tracker source, WildTrack recalculates lateness from that effective time and queues the corrected tracker writeback.
8. The time at which WildTrack happened to detect the change is not used as the lateness timestamp when Drive provides a reliable modification time.
9. If the file becomes private, inaccessible, non-downloadable, or non-PDF after submission, WildTrack keeps the historical attempt but marks the current file unavailable and blocks AI Review, acceptance, and archive capture until the file is valid again.

This closes the editable-after-deadline loophole for both editable Workspace documents and replaced PDF bytes while preserving an auditable version history.
