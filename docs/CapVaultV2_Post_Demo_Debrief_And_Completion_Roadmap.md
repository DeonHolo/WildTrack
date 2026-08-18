# CapVault V2 Post-Demo Debrief and Completion Roadmap

Date: 2026-08-19

Status: Discussion document. This file summarizes the July 2026 demo, reconciles the instructor transcript with the current repository, and identifies the decisions and work required before CapVault can be considered complete. It does not authorize implementation by itself.

Identity update: the later approved Google-attributed, no-OTP student flow is documented in `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`. That document supersedes the earlier identity assumptions in this roadmap.

## 1. Why This Document Exists

The July demo was successful: Sir Ralph liked the direction and saw value in the workflow. The project is no longer trying to prove that the idea is useful. The remaining work is to turn the demonstrated workflow into a reliable system that can be used at the beginning of a real semester.

This document separates four kinds of information so that future implementation does not mix them together:

1. Direct feedback and decisions from Sir Ralph in the supplied transcript.
2. Deon's observations and follow-up notes from before and after the demo.
3. The capabilities that are already present in the current repository.
4. Remaining decisions, gaps, and recommended implementation order.

The transcript is acknowledged as slightly inaccurate. Statements are treated as strong evidence of intent, but ambiguous wording is recorded as an open question instead of silently becoming a requirement.

## 2. Executive Summary

CapVault's strongest direction remains the one Sir responded to positively: a capstone operations tool centered on his existing Sheets, Drive links, tracker, deliverables, advisers, and student progress. The core value is not generic file storage. It is reducing the amount of repetitive opening, checking, matching, and monitoring Sir must do across hundreds of students.

The demo established that academic workspaces, Sheet imports, generated submission forms, role-specific views, tracker integration, and Drive-based Document Check are useful. Since the demo, the repository has also gained a real Spring Boot backend foundation and deterministic PDF checking through Google Drive API.

The most important new correction is identity. Sir's meaning of "no login" was not an untraceable submission. He meant no separate CapVault username/password registration. The approved direction uses Google Identity Services for sender accountability, then lets the student self-declare a workspace Student Number because personal Gmail addresses cannot be collected in advance and OTP is intentionally deferred.

The second major correction is submission validation. An inaccessible, private, non-downloadable, or non-PDF Drive link should be detected before the submission transaction and tracker update are committed. The current background-check behavior is useful for non-blocking analysis, but it is too late for the checks that determine whether a submission is valid at all.

The third correction is tracker meaning. `#N/A` means no submission, `0` means submitted on time, and a positive number means days late. Reporting must count how many students are late or missing. It must not add all days-late values into one large total.

## 3. Product North Star

CapVault should let Sir Ralph answer these questions with as few clicks as possible:

- Who has and has not submitted each deliverable?
- Which submissions are late?
- Which links are inaccessible, not PDF, unreadable, or suspiciously close to the blank template?
- What is inside a submission without opening every file manually?
- Which adviser owns each team, and what feedback or acceptance has been recorded?
- What changed since the last review?
- Which final documents are ready for independent archival?

The interface should behave like a high-volume academic operations inbox, not a card gallery and not a generic analytics dashboard. Tables, filters, counts, selected detail panels, batch actions, and clearly scoped workspaces remain the correct UX direction for 100 to 300 or more students.

## 4. What Sir Ralph Confirmed or Corrected

### 4.1 Class Record and Source Import

- Team Formation, Tracker, and Software Project Monitoring contain related data joined through student identity and team code.
- The tracker shown during development was only a partial or masked view of the full class record. The complete record may include section, gender, and other non-deliverable columns.
- CapVault must not assume that the first three columns are always labels and every remaining column is a deliverable.
- Deliverable detection needs explicit recognition or mapping. Sir must not be forced to reshape the full class record into one hardcoded layout.
- Sir questioned the friction of pasting multiple links and pressing three import actions when data may come from the same spreadsheet or overlapping sources.

Product implication: replace brittle positional assumptions with a source and column mapping workflow that can recognize known fields, suggest deliverables, and let Sir confirm or correct the mapping.

Confirmed decision, 2026-08-19:

- The demo implementation explicitly hardcoded the first three Tracker columns as non-deliverable identity fields and treated the remaining columns as deliverables.
- The transcript does not record Sir approving that positional rule as a permanent requirement. He questioned how non-deliverable columns were excluded and explained that the demonstrated Sheet had masked fields that were not relevant to the tracker view.
- WildTrack may ship with presets tailored to Sir's known Sheet formats, but presets are detection suggestions rather than fixed positional truth.
- Team Formation requires mapped Student Number, Student Name, and Team Code fields. Member Number, `cit.edu` email, section, and adviser are optional mappings when present.
- Tracker requires mapped student/team identity fields. Milestone/deliverable columns and the bottom deadline row are detected dynamically and remain editable before import.
- Software Project Monitoring requires Group Code. Project Title, Software Name, Description, Adviser/Status, Proposal Remarks, Demo Comments, and Category are mapped when present.
- Header aliases, detected value patterns, and known templates may produce suggestions, but Sir can confirm or correct every mapping.
- Import validation must report required fields, optional fields, deliverables, deadlines, and unrecognized columns instead of silently discarding or misclassifying them.
- A source Sheet may contain overlapping data used by more than one importer. WildTrack should not require the same URL to be pasted repeatedly merely because the logical mappings are different.

### 4.2 Student Identity and Google Sign-In

- "No login" means no separate CapVault registration, password, password reset, or account-verification burden.
- Students should use the Google account already active in their browser when opening or submitting a form.
- Team Formation is not expected to contain students' personal Gmail addresses.
- OTP and Microsoft `cit.edu` authentication are not part of the approved current flow.
- On first use, the Google identity selects a workspace Student Number and confirms the derived name, team, member number, and related roster data.
- The resulting association is self-declared and must not be presented as verified.
- Returning forms and the Student Dashboard use the remembered workspace association.
- Response ownership is tied to the Google provider identity, so another account cannot retrieve or overwrite a submitted Drive link merely by selecting the same Student Number.
- Drafts autosave after the first field change, remain private to the Google identity, expire after approximately 30 days, and never update the tracker.

Technical clarification: this experience requires Google Identity Services or OAuth/OpenID Connect for authentication. A Google Drive API key alone cannot securely identify the person using the browser.

Accepted limitation: Google proves control of the Google account but does not prove ownership of the selected Student Number. The remaining privacy and duplicate-association policies are recorded in `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`.

### 4.3 Submission Storage and Source of Truth

- Sir explicitly asked where form responses are stored: the application database or Google Sheets.
- The demo answer did not establish a final authoritative storage design.
- Sir expects tracker values and review views to be driven by real, durable submission data.

Confirmed direction: use a split source-of-truth model. Google Sheets remains authoritative for imported and Sir-maintained academic records. PostgreSQL is authoritative for WildTrack-created identities, drafts, submissions, histories, checks, reviews, feedback, and jobs. Essential operational fields are mirrored to Sheets through a durable retryable outbox so Sir retains his familiar working record without making Sheets responsible for sessions, drafts, ownership, or concurrency.

### 4.4 Drive and PDF Validation

- Students submit Google Drive links, not uploaded submission files.
- PDF-required deliverables must point to an actual PDF, not an editable Google Doc.
- CapVault should inspect Drive metadata, including file type, modified time, accessibility, and, where the API exposes it, file owner/author information.
- Private, inaccessible, or non-downloadable links should be detected on the form before the submission is accepted.
- Once identity, required fields, accessibility, downloadability, and PDF preflight pass, the response is a real submission even if later Document Check finds it mostly blank, template-like, too short, or incomplete.
- Document-quality findings create review flags; they do not erase the attempt or reverse tracker lateness.
- Correcting the work requires a material Edit Response save with a replacement PDF link. A late material edit follows the agreed late-edit tracker rule.

### 4.4.1 Published Forms Stay Open After Due Dates

The transcript explicitly corrects the demo's uncertain auto-unpublish explanation:

- A due date determines on-time versus late status.
- It does not automatically close or unpublish the form.
- Students may continue submitting while the form remains published and will be recorded as late.
- Sir/Admin explicitly unpublishes only when the form should stop accepting responses.
- Existing response history survives unpublishing.

### 4.4.2 Same-Link PDF Replacement

Confirmed decision:

- WildTrack must not treat a stable Drive URL as proof that a submitted PDF is unchanged.
- Initial preflight stores the Drive file ID, MIME type, size, Drive modification time, and a WildTrack-calculated SHA-256 hash of the downloaded bytes.
- Revalidation before AI Review, acceptance, archive, manual/batch recheck, and eligible scheduled checks compares the current bytes with the stored fingerprint.
- A metadata-only timestamp change with identical bytes does not affect lateness.
- A changed SHA-256 creates a preserved file-version event, invalidates previous checks/reviews, reruns Document Check, and uses the later material-save/Drive-modified time for tracker lateness.
- A file that later becomes inaccessible remains in history but cannot proceed to AI Review, acceptance, or archive until restored.
- Invalid links should not create a misleading tracker value that implies Sir can review the file.
- The app should explain the problem while the student is still able to fix the link.

Important distinction: CapVault's submission timestamp comes from CapVault when the validated response is committed. Drive `modifiedTime` describes the file and is not a substitute for the response timestamp.

### 4.5 Document Check and AI Review

- Sir understood and accepted the distinction between deterministic Document Check and deeper AI content review.
- Document Check should handle technical and structural checks such as accessibility, PDF type, readable text, file size, page count, and template similarity.
- AI Review should inspect academic content using a rubric rather than merely repeat technical flags.
- Sir specifically pointed back to the previous IEEE Docs Evaluator and its rubrics as a reference.
- The official template is a blank structured template, not a completed sample.
- Current template comparison needs tuning and must not pretend to grade academic quality.

The intended AI value is triage: summarize the document, compare it with required instructions or rubric criteria, identify missing or weak sections, and help Sir decide what to open first. AI remains advisory and cannot be the final grade.

### 4.6 Forms, Deadlines, and Resubmission

- A due date does not automatically close a form.
- If a form remains published, students may submit after the due date and the tracker records lateness.
- Sir may manually unpublish or reopen a form when needed.
- Reviews and revisions can continue after a nominal deadline.

Product implication: due date and publication state are separate concepts. `Due` controls lateness calculation. `Published` controls whether the form accepts responses.

### 4.7 Tracker Semantics and Analytics

- `#N/A` means the student has not submitted, whether the deadline is still in the future or has already passed.
- `0` means an accepted submission was on time.
- A positive number means the number of days late.
- Blank is not an intended normal tracker state.
- Analytics should count students or responses that are late and missing.
- Summing days late across the whole class is not useful to Sir and should be removed.

### 4.8 Roles and Real-World Testing

- The demonstrated roles remain Teacher/Admin, Adviser, and Student.
- Sir can be both the main administrator and an adviser, so multi-role access remains necessary.
- Usability must be tested with the actual user type for each view, not only with the development team.
- Sir expects the system to run from the beginning of a real semester so normal class activity becomes the test data.
- Early-semester use should exercise document revisions, performance, security, and tracker behavior.
- Archiving may be completed later because final archival activity occurs near the end of the semester.

## 5. Deon's Post-Demo Notes

The following are product observations from the Messenger notes. They are not all confirmed instructor requirements, but they should be retained for the next design pass.

### 5.1 Review and Result Presentation

- AI Review should eventually have a full result dialog comparable to the current Document Check dialog.
- The compact row should show a short result; the dialog should contain the complete findings.
- Student-facing pages should expose the student's own Document Check result.
- Whether students and advisers can see the full AI Review still requires a final policy decision.
- The old `Needs Review` student pill is too vague and visually noisy. Student statuses should focus on actionable facts such as `Submitted`, `Checking file`, `File accessible`, `Fix file access`, `Not PDF`, `Feedback available`, and `Accepted`.
- Avoid accumulating many pills. Use one primary status, restrained secondary metadata, and expandable details.

### 5.2 Official Template Management

- Template upload should use a focused modal instead of being buried in the Workspace page.
- The interface should not use a red warning treatment for normal setup guidance.
- Selecting a file should autofill a sensible template name that Sir can edit.
- Sir should be able to open or preview the current template.
- Template sources should eventually accept a Drive link as well as local DOCX/PDF upload.
- Deliverable Columns should be collapsible so source setup and template work remain easy to reach.
- The `Drive connected` badge and a second sentence saying the same thing are redundant; keep one clear connection indicator.

### 5.3 Student Experience

- Opening a submission form from Student Dashboard should use a new tab so dashboard state is preserved.
- Full Document Check and future AI Review results should be understandable without exposing staff-only wording or raw implementation details.
- The identity and previous-response privacy problem must be solved through real external identity, not through warnings around an anonymous Student Number selector.

### 5.4 Submission and Tracker Feedback

- The post-submit messages need to clearly distinguish three outcomes: response saved, Document Check running or completed, and tracker/Google Sheet update status.
- The observed message `No tracker row matched the given team and member number` needs reproduction and correction. A successful submission must not silently fail to connect to its tracker row.
- `127.0.0.1` and `localhost` are both loopback addresses. Different ports identify different local services. This is local-development behavior, not the final public URL model.

## 6. Current Repository Audit

The current `main` branch is at commit `48d3bf9`, titled `feat: Connected Google Drive API and implemented Document Checking for submissions`.

### 6.1 Implemented and Meaningful Today

- React and Vite frontend with separate Admin, Team Review, Student, Forms, Tracker, Archive, and Workspace experiences.
- Spring Boot backend with Flyway migrations, an embedded local database profile, and PostgreSQL-ready configuration.
- Academic workspaces that isolate IT, CS, and additional course/term datasets.
- Public/published Sheet import for Team Formation, Tracker, and Software Project Monitoring.
- Source-aware import summaries, deadline suggestions, tracker columns, and explicit form generation.
- Stable, readable form routes scoped to an academic workspace.
- Form editing and unpublishing while retaining the deliverable identity.
- Local tracker lateness updates and a queued Google Sheets writeback record.
- Admin Review, group-oriented Team Review, adviser feedback, acceptance, and archive metadata flow.
- Google Drive API access for public Drive files.
- Deterministic Document Check for Drive access, MIME type, size, download permission, PDF integrity, page count, readable text, and official-template comparison.
- Backend persistence for uploaded official templates and Document Check reports.
- Individual and scoped batch Document Check actions.
- Full Document Check result dialog for staff review.

### 6.2 Partially Implemented

- Backend persistence exists for several modules, but forms, public responses, feedback, account/session state, and archive records still depend substantially on frontend `localStorage`.
- Google Sheets imports work through public/published CSV access. Authenticated Sheets API read/write is not operational without credentials and sharing approval.
- Tracker updates change the backend/local application state, but Sir's actual Sheet is not updated unless service-account writeback is configured.
- Official templates can be uploaded as DOCX/PDF, but template Drive links, preview/open actions, filename autofill, and the requested modal workflow are not implemented.
- Student Dashboard shows compact Document Check-derived information, but it does not yet provide the complete result dialog requested in the notes.
- Role-specific screens exist, but authentication and authorization are still simulated rather than enforced through secure sessions.
- Archive has a scalable metadata interface, but no independent final PDF copy is stored yet.

### 6.3 Not Implemented or Not Production-Ready

- Real Google Identity Services/OAuth login and email-to-class-record matching.
- Resolution of Google identity versus Microsoft `cit.edu` identity.
- Server-enforced student, adviser, and admin authorization.
- Durable backend submission and edit history as the authoritative transaction record.
- Pre-submit Drive validation that blocks private, inaccessible, non-downloadable, or non-PDF links before commit.
- Drive owner/author metadata retrieval and display.
- Real Gemini AI Review, AI batch processing, saved AI reports, or AI result dialog.
- Final visibility rules for AI results across Sir, advisers, and students.
- Flexible mapping for a full class record whose non-deliverable columns are not fixed by position.
- A one-workbook, multi-sheet connection flow that avoids unnecessary repeated link entry.
- Corrected tracker analytics that count late/missing students instead of summing late days.
- Independent archive storage, SHA-256 verification of archived bytes, and recovery/retry behavior.
- Production deployment, secure secret management, monitoring, backups, and real multi-user load testing.

### 6.4 Messenger Follow-Up Status Matrix

| Follow-up note | Current status | What remains |
|---|---|---|
| Ask how Sir handles submissions under another student's name or number | Answered by Sir | Use external Google identity and match its email to the class record. Technical identity provider details remain unresolved. |
| Give AI Review the same full-result dialog pattern as Document Check | Not implemented | Build after real AI Review exists and its output contract is approved. |
| Let advisers see AI Review | Unresolved policy | This conflicts with the latest pre-demo Admin-only decision and needs an explicit visibility decision. |
| Provide an applied versus not-applied audit | Completed in this document | Keep this matrix current as work is completed. |
| Upload templates through a modal | Not implemented | Replace the inline Workspace form with a focused add/replace dialog. |
| Remove the red normal-setup warning treatment | Not fully addressed | Reserve red for actual errors; use neutral guidance for missing setup. |
| Autofill template name after file selection | Not implemented | Derive from deliverable or filename, then allow editing. |
| Accept template Drive links | Not implemented | Add backend Drive ingestion and preserve source metadata. |
| Open or view a configured template | Not implemented | Add preview/open action with access handling. |
| Make Deliverable Columns collapsible | Not implemented | Add an explicit expand/collapse control without hiding pending actions. |
| Refine deterministic Document Check | Partially implemented | Core inspection works; heading extraction, author metadata, preflight blocking, and result wording need refinement. |
| Explain `127.0.0.1` versus `localhost` and port `3003` | Explained in this document | Standardize local scripts and user-facing URLs so presenters do not need to explain development ports during normal use. |
| Explain submission success versus pending tracker sync | Partially addressed | UI separates states, but unmatched tracker rows still require a reproducible fix and clearer recovery. |
| Let students see their own Document Check result | Partially implemented | A compact summary exists; add the full student-appropriate result dialog. |
| Let students see AI Review | Not implemented and unresolved | Decide whether students see technical status only, selected findings, or the full report. |
| Remove vague `Needs Review` status from Student Dashboard | Not implemented | Replace with one concrete, actionable primary state. |
| Reduce pill overload throughout the student experience | Not implemented consistently | Use one primary status plus plain metadata and expandable detail. |
| Open forms from Student Dashboard in a new tab | Not implemented | Use a new tab while preserving current dashboard filters and scroll state. |
| Remove duplicate Drive connection messaging | Not implemented | Keep one concise connection indicator in Workspace. |

## 7. Where New Feedback Supersedes Older Decisions

These changes must be applied to the V2 SRS and SDD before the next large implementation batch.

### 7.1 Authentication

Older direction: anonymous submission is allowed and an optional CapVault account unlocks the dashboard.

New instructor direction: no CapVault password registration is needed, but Google identity is required and must match an authorized class-record email before submission.

This is a direct requirements change, not a UI tweak.

### 7.2 Invalid Submission Handling

Older/current behavior: save the response immediately, update the local tracker, then run Document Check in the background; failed checks remain visible for follow-up.

New instructor direction: accessibility and valid PDF checks should occur before the transaction is committed. A private or unusable file should not create a tracker value that implies a reviewable submission exists.

Recommended split:

- Blocking preflight: authenticated identity, accessible file, downloadable file, PDF MIME type, supported size, and minimally parseable PDF.
- Non-blocking Document Check: page/readable-text metrics, template similarity, missing headings, and other screening findings.
- Manual AI Review: rubric-based content summary and deeper academic triage.

### 7.3 AI Visibility

Latest pre-demo decision: only Admin/Sir can run or view privileged AI Review controls; advisers use Document Check only.

Deon's post-demo note: advisers should be able to see AI Review once available, and students may need to see their own results.

The transcript confirms AI content review is useful but does not settle visibility. This remains a real policy decision and must not be guessed.

### 7.4 Form Deadline Behavior

Any implementation or wording that implies automatic closing at the due date is incorrect. Forms remain usable while published; late submissions are recorded as late.

## 8. Recommended Completion Tracks

### Track 0: Reconcile Requirements Before Coding

1. Resolve the Google versus Microsoft identity source.
2. Decide the authoritative submission store and Sheet synchronization contract.
3. Decide AI result visibility for Sir, advisers, and students.
4. Update the V2 SRS and SDD to remove superseded anonymous-submission and post-commit validation rules.

### Track 1: Identity and Access

1. Integrate Google Identity Services/OAuth without introducing a separate CapVault password.
2. Match verified email to the active workspace's Team Formation record.
3. Derive Student Number, name, team, member number, and section from the matched identity.
4. Enforce role and adviser-team scope on the backend.
5. Support Sir's combined Admin and Adviser roles in one account.
6. Define recovery for incorrect or changed class-record emails without creating routine manual work for Sir.

### Track 2: Durable Submission Pipeline

1. Move public form definitions, responses, edits, and history from browser storage to backend persistence.
2. Add preflight identity and Drive validation.
3. Commit a response and tracker event only after blocking checks pass.
4. Preserve every meaningful edit and calculate lateness according to the approved first-attempt/edit policy.
5. Make retry behavior idempotent so refreshes and double-clicks do not duplicate submissions.
6. Show a clear receipt containing response time, tracker outcome, and Document Check state.

### Track 3: Flexible Sheet Connection and Mapping

1. Support a single spreadsheet with multiple tabs as well as separate spreadsheet links.
2. Detect candidate sheets and columns by header aliases and data shape.
3. Present a mapping review instead of relying on hardcoded column positions.
4. Let Sir mark columns as identity, metadata, deliverable, ignored, or deadline.
5. Save mappings per workspace and reuse them on refresh.
6. Report schema drift when Sir adds, removes, or renames columns.

### Track 4: Tracker Correctness and Reporting

1. Implement exact `#N/A`, `0`, and positive-days-late semantics.
2. Remove summed late-day totals.
3. Report counts and rates for submitted, on-time, late, and missing students per deliverable.
4. Fix unmatched tracker-row handling and make failures actionable.
5. Add authenticated Sheets API writeback only after Sir grants the required access.

### Track 5: Document Check and Template UX

1. Move blocking Drive/PDF checks into preflight.
2. Keep deeper deterministic screening asynchronous.
3. Add Drive owner/author metadata where available.
4. Tune template heading extraction to ignore institutional boilerplate.
5. Add template upload modal, automatic editable naming, preview/open, replacement, and removal.
6. Add template Drive-link ingestion after the local upload workflow is stable.
7. Make Deliverable Columns collapsible and remove redundant connection messaging.
8. Expose a full, student-appropriate Document Check dialog for the student's own response.

### Track 6: AI Review

1. Study and adapt the IEEE Docs Evaluator rubric model.
2. Define a versioned rubric per deliverable.
3. Send extracted submission text, official template instructions, and rubric criteria to Gemini through the backend.
4. Return summary, rubric findings, missing or weak sections, red flags, and suggested review action.
5. Provide individual and deliverable-scoped batch execution with quotas, progress, retry, and stale-result detection.
6. Present the short result in the review row and the full result in a dedicated dialog.
7. Keep AI advisory and visibly separate from acceptance and grading.

### Track 7: Role and UX Refinement

1. Test Admin workflows with Sir, adviser workflows with advisers, and student workflows with students.
2. Replace vague or excessive pills with one primary state and expandable detail.
3. Open student forms in a new tab and preserve dashboard state.
4. Keep queues compact and batch-friendly at class scale.
5. Ensure status changes immediately update Command Center, Review, Team Review, and Student Dashboard.
6. Verify keyboard access, focus management, error placement, readable contrast, and 44-pixel minimum interactive targets.

### Track 8: Archive and Production Readiness

1. After the submission workflow is stable, store independent final PDF bytes in R2 or another approved object store.
2. Record SHA-256, source metadata, archive time, and verification history.
3. Add retry, duplicate protection, recovery, and access-controlled download.
4. Deploy before the next semester begins and run with real activity.
5. Add logs, monitoring, backups, secret rotation, rate limiting, and multi-user performance testing.

## 9. Recommended Delivery Order

The shortest path to a trustworthy real-semester system is:

1. Identity decision and SRS/SDD correction.
2. Real authentication and backend authorization.
3. Durable submission persistence and blocking preflight validation.
4. Flexible Sheet mapping and correct tracker behavior.
5. Document Check refinement and template-management UX.
6. Gemini AI Review and finalized result visibility.
7. Role-specific usability testing and polish.
8. Independent final archive and production hardening.

AI should not come before identity and durable submission handling. Otherwise CapVault would generate better analysis on top of records it still cannot securely attribute or reliably preserve.

## 10. Open Questions for the Next Discussion

No unresolved workflow questions remain in this section. New questions discovered during detailed design must be added explicitly rather than inferred from older notes.

## 11. Definition of a Finished Core Workflow

CapVault's core semester workflow is complete when:

- Sir connects or maps the real class sources without reshaping them for CapVault.
- An authorized Google identity opens a deliverable form and is matched to exactly one class-record student.
- The student submits an accessible, downloadable PDF Drive link.
- Invalid identity, private link, or non-PDF problems are fixed before submission commit.
- A valid response is durably stored once, timestamped, and reflected in the tracker with correct lateness semantics.
- Sir and the assigned adviser can find the response, open the file, inspect Document Check, record feedback, and accept it within their permissions.
- Sir can run AI Review individually or by deliverable using an approved rubric.
- Students can see their own submission state and permitted feedback without seeing another student's data.
- All views stay synchronized after edits, acceptance, and tracker changes.
- The system can survive browser refresh, another device, concurrent users, and server restart without losing operational records.

Archive completion remains a later semester milestone, but final accepted PDFs must eventually be copied independently and verified rather than preserved only as student-owned Drive links.

## 12. Documents That Need Reconciliation

After the open identity and storage questions are answered, update these source documents:

- `docs/SRS (2526-sem2-it332-41) (CapVault V2 - Google-first Pivot).md`
- `docs/SDD (2526-sem2-it332-41) (CapVault V2 - Google-first Pivot).md`
- `docs/CapVaultV2_UI_Roles_And_Data_Changes.md`
- `docs/CapVaultV2_Backend_Phase1_Plan.md`
- `README.md`

The older pivot notes should remain as historical context. They should not silently override the later instructor decisions recorded here.

## 13. Technical References

- [Google Identity Services: Verify the Google ID token on the server](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Google Identity Services: Web integration considerations](https://developers.google.com/identity/gsi/web/guides/integrate)
- [Google Drive API: File resource fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [Google Drive API: Authentication and authorization scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
