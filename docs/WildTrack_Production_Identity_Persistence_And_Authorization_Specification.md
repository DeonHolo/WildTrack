# WildTrack Production Identity, Persistence, and Authorization Specification

**Status:** Ready for agent implementation  
**Triage:** `ready-for-agent`  
**Date:** August 23, 2026  
**Scope:** First production-readiness milestone after Google identity verification

This specification turns the approved Google-attributed student workflow into a durable, server-authorized system. It supersedes earlier production notes that describe student passwords, required registration, OTP verification, or browser storage as an acceptable source of truth.

## Problem Statement

WildTrack now verifies real Google credentials and presents the intended low-friction student experience, but the verified identity is not yet a durable WildTrack login. The backend returns Google profile data without creating a secure server session, all API routes are currently public, and the browser still owns student associations, submissions, response history, reviews, feedback, archive metadata, and AI placeholders.

This means a refresh, another browser, cleared storage, or a crafted API request can bypass or lose behavior that appears complete in the interface. Sir Ralph cannot safely hand the system to students or advisers until the backend, rather than the browser, decides who the user is, which workspace and records they may access, and which changes are permanently stored.

The production flow must keep the convenience Sir values. Students should still open a form link directly, continue with the Google account already active in their browser when possible, select their class-record identity once, and submit without creating a WildTrack password. Production readiness must remove hidden technical fragility without adding a new registration chore.

## Solution

WildTrack will convert a backend-verified Google credential into a secure WildTrack session stored in an HttpOnly cookie. PostgreSQL will become authoritative for Google identities, sessions, workspace-scoped student associations, staff access, drafts, responses, material edit history, feedback, acceptance, identity conflicts, and audit events.

Google Sheets will remain authoritative for Team Formation, Tracker values, and Software Project Monitoring data. A student association will connect a Google identity to one imported Student Record inside one Academic Workspace, with an assurance level of `SELF_DECLARED`. Selecting a Student Number will not expose another Google identity's private submissions or Drive links. Conflicting claims will be preserved and flagged without blocking submission or creating routine work for Sir.

Backend authorization will enforce role and workspace boundaries for every protected API. Sir may hold Teacher/Admin and Adviser roles at the same time. Advisers will see only assigned teams. Students will see only records owned by their Google identity plus the public class-record fields explicitly allowed by the product.

The frontend will stop treating local storage as the source of truth. It will load the current session and authorized workspace data from the backend, keep only harmless UI preferences locally, and retain starter-data reset behavior strictly in the local development profile.

## User Stories

1. As a student, I want a form link to open before I sign in, so that the workflow still feels as direct as Sir's Google Forms workflow.
2. As a student, I want Google One Tap to recognize me when browser conditions allow it, so that I usually do not have to perform a separate login step.
3. As a student, I want a normal Continue with Google action when One Tap does not appear, so that browser privacy settings never block me from submitting.
4. As a student, I want WildTrack to remember my authenticated session across refreshes and normal browser restarts, so that I do not repeatedly confirm the same Google account.
5. As a student, I want logout to end my WildTrack session, so that another person using the device cannot open my dashboard.
6. As a student, I want logout to suppress immediate Google auto-selection, so that I can intentionally switch accounts.
7. As a student, I want to select a Student Number only from the form's Academic Workspace, so that an IT form never shows CS records and vice versa.
8. As a student, I want selecting my Student Number to fill my name, team, member number, section, and adviser, so that I do not repeat class-record details.
9. As a student, I want my Google account and selected Student Record to remain separate audit facts, so that WildTrack does not falsely claim institutional verification.
10. As a student, I want my Student Record association remembered for that workspace, so that later forms and the dashboard open with the correct class context.
11. As a student, I want to disconnect an incorrect Student Record association with confirmation, so that routine mistakes do not require Sir to repair them.
12. As a student, I want disconnecting a Student Record to preserve my previous submissions and audit history, so that correction does not destroy evidence.
13. As a student, I want a future semester or different workspace to have its own Student Record association, so that historical enrollment is not overwritten.
14. As a student, I want to submit even when another Google account selected the same Student Number, so that a mistaken first claim cannot lock me out.
15. As a student, I want my drafts, submitted links, feedback, and private results hidden from another Google account using the same Student Number, so that selecting an ID never becomes a privacy bypass.
16. As a student, I want draft autosave after I make a change, so that unfinished work can be restored on another device using the same Google account.
17. As a student, I want drafts to expire after the configured retention period, so that abandoned data is not retained indefinitely.
18. As a student, I want clearing a draft to require an intentional action, so that it is not confused with submitting or editing a response.
19. As a student, I want one active response per Google identity per published form, so that Edit Response updates my own response instead of creating accidental duplicates.
20. As a student, I want Edit Response to prefill my previous values, so that I can correct only what changed.
21. As a student, I want opening Edit Response without saving changes to leave timestamps and tracker lateness untouched, so that accidental visits do not make me late.
22. As a student, I want every materially changed save preserved in response history, so that previous links and timestamps are not overwritten.
23. As a student, I want a clear conflict message if another tab or device changed my response first, so that my newer work is not silently lost.
24. As a student, I want my dashboard to show only my Google-owned submissions, allowed Document Check results, and adviser feedback, so that another student's records never appear because of a shared Student Number.
25. As a student, I want the dashboard to show my imported profile and permitted class/project context, so that I can confirm I selected the correct record.
26. As an adviser, I want Google authentication to open only my assigned workspaces and teams, so that the interface stays focused and private.
27. As an adviser, I want to review one representative group output when multiple members submitted the same deliverable, so that I can focus on the team's work rather than duplicate grading records.
28. As an adviser, I want to open authorized submitted links, view current Document Check results, accept group output, and write student-visible feedback, so that I can complete the adviser workflow in one place.
29. As an adviser, I want to view existing AI Review reports for my assigned teams without triggering new AI requests, so that Sir controls quota and evaluation runs.
30. As an adviser, I want requests outside my team assignments rejected by the backend, so that changing a URL cannot reveal another team's records.
31. As Sir/Admin, I want my Google identity bootstrapped from protected configuration, so that the first staff login works without a public registration flow.
32. As Sir/Admin, I want one account to hold Teacher/Admin and Adviser roles, so that I can switch between class-wide work and my assigned teams.
33. As Sir/Admin, I want to add, update, disable, and scope a small number of staff Google accounts, so that adviser access remains manageable without generic user administration.
34. As Sir/Admin, I want unknown Google accounts to receive no staff permissions, so that student sign-in cannot open staff pages.
35. As Sir/Admin, I want role and workspace checks enforced by the backend on every protected action, so that the sidebar is not the security boundary.
36. As Sir/Admin, I want identity conflicts visible only in relevant response/student context, so that real issues are discoverable without cluttering every review row.
37. As Sir/Admin, I want the first accepted response for a Student Number and deliverable to remain the canonical tracker source, so that later conflicting accounts do not silently replace tracker values.
38. As Sir/Admin, I want to select another preserved response as canonical with an audit trail, so that legitimate identity mistakes can be corrected.
39. As Sir/Admin, I want published forms, submissions, reviews, feedback, and acceptance to survive browser clearing and server restarts, so that WildTrack is operationally trustworthy.
40. As Sir/Admin, I want reset-to-starter-data controls available only in the local development profile, so that demonstration tools cannot erase production data.
41. As Sir/Admin, I want a reset confirmation to identify the exact workspace and affected developer data, so that testing one workspace does not unexpectedly change another.
42. As Sir/Admin, I want activity records for sign-in, association changes, submissions, material edits, feedback, acceptance, canonical corrections, and access changes, so that disputed actions can be reconstructed.
43. As a system operator, I want sessions revocable and expiring, so that removed staff access and lost devices do not retain indefinite authorization.
44. As a system operator, I want secrets and bootstrap allowlists supplied through backend configuration, so that OAuth and staff credentials are not committed to the repository or exposed to Vite.
45. As a system operator, I want the deployed frontend and API to use same-site session cookies where possible, so that authentication remains reliable without exposing bearer tokens to browser storage.
46. As a system operator, I want database migrations to upgrade existing academic data without deleting it, so that current Sheet imports and Document Check records remain usable.
47. As a developer, I want starter data and role preview controls to remain useful locally, so that UI and role testing stays fast after production authorization is added.
48. As a developer, I want automated journeys to verify real authorization boundaries, so that a visually correct page cannot hide an insecure API.

## Implementation Decisions

### Source-of-Truth Boundary

- Google Sheets remains authoritative for imported roster, tracker, project, adviser-name, milestone, deadline, and other Sir-maintained academic data.
- PostgreSQL is authoritative for WildTrack identities, sessions, associations, drafts, responses, response history, conflicts, staff access, role assignments, team assignments, feedback, acceptance, audit events, Document Check references, AI Review references, and later archive jobs.
- Browser storage is limited to non-sensitive display preferences, dismissed hints, development preview state, and One Tap suppression after explicit logout.
- Existing browser-owned demo records are not silently promoted to production records. Development starter data remains available through explicit local-only reset controls.

### Google Identity and WildTrack Session

- The existing backend Google ID-token verification remains the only trust boundary for Google identity.
- Successful Google authentication upserts a Google Identity using Google's stable `sub` as the unique provider key and stores an email/name/picture snapshot for display and audit.
- The backend creates a revocable WildTrack session and sends an opaque session identifier through an HttpOnly cookie. The raw session value is never stored in PostgreSQL; only a secure hash is stored.
- Cookies use `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` outside local development.
- The default session has a configurable rolling inactivity lifetime; thirty days is the initial default. Logout, staff disablement, and security-sensitive account changes revoke affected sessions.
- `GET /api/session` returns the authenticated identity, authorized roles, workspace access, active student associations, and expiry metadata needed by the frontend.
- `POST /api/auth/google` verifies the credential, creates or refreshes the server session, sets the cookie, and returns the session view.
- `POST /api/auth/logout` revokes the server session, clears the cookie, and remains compatible with the frontend's Google auto-selection suppression.
- The OAuth client secret is not used by the browser ID-token flow. The OAuth client ID is public configuration; all private provider and model keys remain backend-only.

### Request Security

- Spring Security no longer permits all `/api/**` routes.
- Public access is limited to health, Google authentication, minimal public workspace/form metadata, and endpoints strictly required to render a published form before sign-in.
- Student, Adviser, Teacher, and Admin permissions are enforced using authenticated session authorities and workspace scope.
- Mutating cookie-authenticated requests use CSRF protection. The frontend echoes a readable CSRF token in the configured request header; the session cookie remains unreadable to JavaScript.
- CORS allows credentials only from configured local or deployed origins. Production should serve the frontend and API under the same site when practical.
- Direct object references never authorize access. Every response, draft, feedback, report, team, and workspace lookup is constrained by the authenticated principal.

### Core Identity Model

- `UserAccount` represents an internal WildTrack person/account lifecycle.
- `ExternalIdentity` represents the Google provider identity and uniquely stores provider plus provider subject.
- `UserSession` stores session hash, account, creation, last-used, expiry, revocation, and basic audit metadata.
- `StudentAssociation` connects one account to one Student Record in one Academic Workspace and stores assurance level, status, associated/disconnected timestamps, and audit origin.
- Current associations use assurance `SELF_DECLARED`. The model reserves `VERIFIED_INSTITUTIONAL_EMAIL` and `STAFF_CONFIRMED` without implementing them now.
- One account has at most one active Student Association per Academic Workspace. A Student Record may be associated with multiple accounts; that creates an Identity Conflict rather than blocking the second student.
- Disconnecting closes the current association. It does not delete account-owned submissions, drafts, feedback, reports, or audit history.

### Staff Access and Roles

- Staff roles are `ADMIN`, `TEACHER`, and `ADVISER`; one account may hold multiple roles.
- A protected backend setting bootstraps initial staff Google email addresses and roles. No personal email is hardcoded in source or migrations.
- After first successful allowlisted authentication, access binds to the verified Google subject.
- Staff Access records can be disabled without deleting historical authored actions.
- Workspace Access scopes Teacher/Admin visibility. Adviser Team Assignment scopes Adviser visibility to imported teams.
- Adviser names imported from Software Project Monitoring are descriptive data until explicitly mapped to an Adviser account.
- The frontend role switcher changes the active authorized view only; it never grants a role that the session does not contain.

### Student Association and Conflict Rules

- Student Number selectors query only Student Records belonging to the current form's Academic Workspace.
- Association confirmation records the Google identity, selected Student Record, workspace, assurance, timestamp, and audit event.
- Student Number, Student Name, and Team Code may remain editable/selectable for Sir's familiar workflow, but only Student Number determines the imported Student Record association. Derived values must match a real record before save.
- A second account may associate with the same Student Record and submit. WildTrack records an Identity Conflict and keeps private data isolated.
- Conflict flags appear in relevant response details, student context, and a compact staff exception view rather than every normal row.
- The first accepted canonical response for a Student Number and deliverable remains the tracker source. Changing it requires an explicit audited correction.

### Persistent Drafts

- Drafts are keyed by account, workspace, and published form.
- Draft payloads contain editable form fields and a revision number; they are never considered submitted responses.
- Drafts are created only after a material field change and expire after approximately thirty days by default.
- Saving a draft never changes tracker values, sends staff notifications, starts Document Check, or starts AI Review.
- Draft endpoints support load, upsert with optimistic revision checking, clear, and expiry cleanup.

### Persistent Responses and Edit History

- One account has one active Response per published form. Student Number alone is never the ownership key.
- A Response stores account, external identity snapshot, workspace, form/deliverable, Student Record snapshot, current fields, timestamps, decision state, canonical-tracker state, and revision.
- Sensitive values, especially Drive links, are returned only to the owning student and authorized staff.
- Every materially changed save writes an immutable Response Version.
- Opening edit mode or submitting identical values does not write a version, alter lateness, or rerun checks.
- Concurrent edits use optimistic locking and return `409 Conflict` rather than overwriting newer data.
- Submission creation and its pending tracker-write event commit in one transaction. Pending remote Sheet writeback does not make the response appear unsaved.
- A changed PDF invalidates current Document Check and AI Review freshness but preserves historical reports.

### Feedback, Acceptance, and Review Ownership

- Feedback stores staff author, role, visibility, workspace, response, content, and timestamp with audit history.
- Assigned advisers and authorized Teacher/Admin staff may create student-visible feedback.
- Acceptance stores staff identity, active role, scope, response version, and timestamp.
- Adviser acceptance is allowed for assigned teams. Teacher/Admin acceptance is allowed across authorized workspaces.
- A material response change after acceptance returns to pending review while preserving the previous acceptance.
- AI Review remains staff-only: Sir/Admin can trigger it; assigned advisers can view it; students never receive it.

### API Surface

- Authentication/session: Google credential exchange, current session, logout.
- Student association: list eligible workspace records, view association, associate, disconnect.
- Student dashboard: one server-composed response with profile, owned submissions, permitted Document Check status, feedback, team counts, project metadata, and allowed tracker context.
- Drafts: get/upsert/delete the authenticated account's form draft.
- Responses: create/update an account-owned response, load it for edit, and load history.
- Staff review: deliverable summaries, filtered queues, details, feedback, acceptance/revocation, and canonical correction.
- Staff access: list/add/update/disable staff accounts, roles, workspace access, and adviser team assignments.
- Every workspace endpoint validates the Academic Workspace against the session.
- Stable error codes cover unauthenticated, forbidden, workspace denied, team denied, stale revision, unpublished form, missing Student Record, identity conflict, and validation failures.

### Frontend State Migration

- `WorkflowContext` stops owning authenticated accounts, associations, responses, feedback, acceptance, and archives in local storage.
- A focused Session provider loads `/api/session` and refreshes authorized views after Google authentication.
- Page services load dashboard, form, review, adviser, and staff access data through backend APIs.
- Google One Tap and fallback button remain shared components.
- Forms show deliverable information before authentication and reveal response fields only after a verified server session.
- Routes handle loading, signed-out, forbidden, empty, and recoverable-error states without flashing unauthorized content.
- Development role preview may preview presentation only and cannot bypass backend authorization.

### Development Reset and Starter Data

- Starter reset exists only in an explicit local profile and is unavailable in production.
- Reset is workspace-scoped and names the workspace and data categories affected.
- Reset may restore deterministic local identities, roles, forms, responses, and reviews for tests, but never shared production data.
- Switching workspaces never recreates starter data or undoes a deliberate reset.

### Audit and Retention

- Audit events cover authentication, logout, revocation, association/disconnection, conflicts, submission, material edit, feedback, acceptance/revocation, canonical correction, staff access, and local reset.
- Events reference actor, workspace, target, action, timestamp, and safe metadata.
- Google subjects and submitted links are not emitted to general logs.
- Draft and session retention is configurable. Responses and review history remain until a semester cleanup/archive policy is implemented.

### Delivery Order

1. Database migrations and repositories for identity, session, access, associations, drafts, responses, history, feedback, acceptance, conflicts, and audit.
2. Session issuance, current-session lookup, logout, CSRF, and protected API defaults.
3. Staff bootstrap, roles, workspace access, adviser assignments, and authorization policies.
4. Student association and dashboard APIs.
5. Persistent drafts, responses, material edit history, ownership, and tracker outbox integration.
6. Persistent review/adviser feedback and acceptance APIs.
7. Frontend migration away from browser-owned domain records.
8. Local-only reset and full authorization verification.

The next milestones are durable Document Check jobs, Gemini AI Review, reliable Google Sheets outbox processing, independent archive storage, notifications, and deployment operations.

## Testing Decisions

### Primary Test Seam

The highest useful seam is the complete journey:

`Google credential -> WildTrack session -> workspace association -> authorized domain action -> persistent reload`

Tests observe external behavior and database outcomes through APIs. They do not assert private helper calls, repository implementation details, cookie internals, or React component state.

### Backend Tests

- Use a controllable Google verifier; automated tests do not call live Google services.
- Use PostgreSQL-compatible integration tests for migrations, uniqueness, optimistic locking, and transactions. Testcontainers PostgreSQL is preferred for the production persistence suite.
- Cover valid/invalid authentication, wrong audience, disabled accounts, logout, revoked/expired sessions, and rotation.
- Prove allowed and denied access for every role, workspace, and adviser team boundary.
- Cover first association, disconnect/reconnect, multiple workspaces, duplicate claims, conflict visibility, and privacy isolation.
- Cover draft save/update/stale revision/clear/expiry/cross-account denial and no side effects.
- Cover first submission, identical resave, material edit, immutable history, concurrent conflict, unpublished form, ownership isolation, identity conflict, and canonical tracker behavior.
- Cover adviser and Teacher/Admin feedback/acceptance scope, changed-after-acceptance, revocation, and audit history.
- Prove reset is unavailable outside the local profile and scoped inside it.

### Frontend Tests

- Cover session loading, authenticated, signed-out, expired, forbidden, logout, and Google exchange states.
- Prove form fields are gated, Student Records are workspace-scoped, drafts restore, private values do not leak, and history changes only after material saves.
- Prove the dashboard shows only account-owned private records when two accounts share a Student Number.
- Prove adviser and staff navigation/actions derive from server roles, not preview state.
- Preserve existing accessibility and responsive presentation checks.

### Browser Journeys

1. New identity opens an IT form, associates an IT record, submits, reloads, opens dashboard, and edits its response.
2. Returning identity opens another IT form without repeating association.
3. The same identity opens a CS form and receives a separate CS association flow.
4. A second identity selects the same Student Number, submits separately, and cannot see the first identity's private data.
5. Adviser sees only assigned teams, leaves feedback, accepts output, and cannot call an unassigned endpoint directly.
6. Sir switches Teacher/Admin and Adviser views while retaining only granted roles.
7. A stale tab cannot overwrite a newer response.
8. Local reset restores one workspace without changing another; production exposes no reset.

### Prior Art

- Existing Google authentication tests provide the credential-verification seam.
- Existing role-flow browser tests provide multi-role navigation coverage.
- Existing form, dashboard, review, adviser, workspace, and tracker tests provide workflows to migrate from local state to API fixtures.
- Existing backend controller tests establish the current MockMvc/service style.

## Out of Scope

- Student passwords, password reset, manual registration, OTP, Microsoft login, or a personal Gmail roster column.
- Calling self-declared Student Number associations verified.
- Automatic staff roles from imported adviser names.
- Student-visible AI Review or adviser-triggered Gemini requests.
- Gemini execution, Batch API, and AI usage reporting; these follow the approved AI specification.
- Durable Document Check job processing.
- Live Google Sheets credentials and retry operations beyond committing a pending outbox event.
- Cloudflare R2 archive storage, byte-level integrity verification, archive retries, and cleanup.
- Email notifications, hosting, custom domains, OAuth publication, monitoring, backups, and disaster recovery.
- Migrating arbitrary browser local-storage history into production PostgreSQL.
- Renaming backend Java packages in this milestone.

## Further Notes

- Google email is an identity attribute, not the authorization decision. Google `sub`, account status, roles, workspace access, and team assignments determine access.
- Students do not need to know that WildTrack creates an internal account row. Continue with Google is the entire account flow they experience.
- The UI must not call a `SELF_DECLARED` Student Record association verified.
- This milestone preserves the current WildTrack UI and low-click form flow while replacing its trust and persistence foundation.
- Current uncommitted OAuth and UI work must be preserved; implementation must not reset or overwrite it.

