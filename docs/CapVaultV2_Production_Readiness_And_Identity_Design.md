# CapVault V2 Production Readiness And Identity Design

Status: Approved design and current limitation record  
Date: 2026-07-27  
Implementation boundary: Documentation and privacy-safe demonstration behavior only. Real authentication, account verification, and server-side sessions are not implemented yet.

## 1. Purpose

This document records the intended production identity model and the current limitations that must not be mistaken for production security.

CapVault currently demonstrates Sir Ralph Laviste's workflow, but several operational records still live in browser storage and the account flow does not yet prove ownership of a Student Number. The production implementation must preserve the low-friction public submission workflow while preventing optional student accounts from exposing another student's private dashboard.

## 2. Database Reality

CapVault already has a backend database.

The local backend uses a file-based H2 database:

```text
backend/data/capvault-local.mv.db
```

It currently persists:

- Academic workspaces
- Connected Sheet source records
- Sheet import runs
- Imported Team Formation students
- Tracker columns, rows, and cells
- Software Project Monitoring metadata
- Deliverables
- Tracker writeback attempts

It does not yet persist:

- Real user accounts or password credentials
- OAuth identities or sessions
- Student Number claims
- Public form responses and response history
- Adviser feedback and review decisions
- AI reports
- Archive records and preserved PDF bytes
- Notifications

PostgreSQL is configured as the production database target. H2 exists to make local development and the current demonstration easy to run.

## 3. Production Student Identity Design

### 3.1 Workspace discovery

A real student must never use Sir's administrative workspace switcher to determine whether they belong to IT or CS.

The production flow shall be:

1. The student signs in to an optional CapVault account.
2. The student enters or selects a Student Number.
3. The backend searches the Student Number across all active Team Formation records.
4. A unique match determines the student's program, course/section, semester, name, team code, member number, adviser, and academic workspace.
5. The student's dashboard opens in that matched academic workspace.
6. If a student appears in more than one active workspace, the dashboard shows only those matched memberships. This primarily supports different courses or terms; simultaneous IT and CS membership is not expected.

The staff workspace switcher remains an administrative control and is not part of student identity resolution.

### 3.2 Ownership verification

Selecting a Student Number does not prove that the account belongs to that student.

Before production, CapVault must verify a claim using one of these institutional methods:

- One-time code sent to the `cit.edu` address imported from Team Formation
- Institutional Microsoft account sign-in matched to the Team Formation email

OTP and institutional login are intentionally deferred. Until one is implemented, the current browser-local claim is demonstration behavior only and must not be treated as secure access control.

In production, an unverified claim must not unlock private submissions, feedback, tracker details, or submitted Drive links.

### 3.3 Student-controlled disconnection

The student dashboard shall provide a self-service **Disconnect** action for the current workspace claim.

Disconnection:

- Removes the Student Number connection from the account
- Does not delete the class record
- Does not delete submitted responses
- Allows the account to select another unclaimed Student Number

This keeps routine correction on the student side. A rare administrative reset may still be required if a wrong or malicious claim blocks the real owner, but CapVault shall not make Sir process a normal identity-approval queue.

## 4. Public Form Identity And Privacy

Public deliverable forms remain account-optional.

### 4.1 Workspace-scoped roster

Every published form belongs to one academic workspace.

- An IT form lists only Student Numbers imported into that IT workspace.
- A CS form lists only Student Numbers imported into that CS workspace.
- Name and Team Code are derived from the selected workspace roster row.
- A form must never use a global Student Number pool across programs, classes, or terms.

### 4.2 Existing responses

The current low-friction response behavior is retained for the demonstration:

- A response is identified by workspace, deliverable, and Student Number.
- Submitting the same combination updates the recorded response.
- The form warns the visitor that a response already exists.

Privacy safeguard:

- The form must never prefill or reveal the existing submitted Drive link to a visitor who merely selects that Student Number.
- Existing response values remain private.
- The visitor must provide the complete new submission value.
- The warning encourages optional account creation for progress tracking.

This prevents passive disclosure of submitted links, but update-by-Student-Number is not strong production authorization. A final production decision is still required if Sir wants stronger response ownership without requiring an account.

### 4.3 Production edit-response ownership

The production form flow shall preserve Google Forms-style convenience without making account creation mandatory:

1. A student submits through the public form without signing in.
2. CapVault creates the response and returns an unguessable private edit-response link.
3. Only that edit link, or a verified optional student account, can reopen the saved values and update that response.
4. Selecting the same Student Number on a fresh public form must not reveal or overwrite the existing response.
5. If the student loses the edit link, recovery requires the optional account or a one-time code sent to the institutional address from Team Formation.

The Student Number identifies the class-record row; it is not an authentication secret. This edit-token flow handles normal corrections without creating an approval queue for Sir.

### 4.4 Dashboard ownership

An optional account may track progress, submissions, adviser feedback, and tracker values only after its Student Number claim is verified. This is where OTP or institutional Microsoft sign-in is required. Registration alone must not unlock another student's private data.

## 5. Current Production Gaps

The following are known production blockers, not hidden defects.

| Area | Current state | Why it is not production-ready |
|---|---|---|
| Authentication | Registration and login use browser state | Passwords are not securely stored or verified and there are no server sessions |
| Student claims | Browser-local Student Number connection | Ownership is not verified through institutional email or Microsoft login |
| Authorization | Staff routes and backend APIs are open | Admin, adviser, and student permissions are visual previews rather than enforced RBAC |
| Public forms | Form definitions and responses partly use browser storage | Different devices do not share a complete response workflow |
| Response ownership | Existing links are hidden, but the demonstration still updates by Student Number | Production needs an unguessable edit-response token or a verified optional account |
| Adviser scope | Adviser preview uses imported names and local role selection | There is no authenticated adviser account or server-enforced assignment |
| Google Drive | Link format is checked locally | MIME type, access, file bytes, and PDF readability require Drive API |
| Google Sheets | Public import works; writeback adapter exists | Remote writes require service-account credentials and Sheet permission |
| AI review | Honest unavailable state | PDF extraction, template comparison, and Gemini are not connected |
| Archive | Metadata-only archive records | Cloudflare R2, independent PDF bytes, byte-level SHA-256, and verification are not connected |
| Notifications | Not implemented in V2 | Email and persistent in-app delivery require backend accounts and jobs |
| Audit and jobs | Partial local activity records | Production requires durable audit events, retries, and background job state |

## 6. Production Implementation Order

1. Backend accounts, password hashing, OAuth identities, and secure sessions
2. Server-enforced Admin, Adviser, and Student authorization
3. Cross-workspace Student Number lookup and institutional ownership verification
4. Backend public form definitions, responses, and response history
5. Google Drive PDF validation
6. Google Sheets submission and tracker writeback credentials
7. Adviser feedback and review persistence
8. Gemini evaluation
9. Cloudflare R2 archive bytes and hash verification
10. Notifications and durable audit jobs

## 7. Demonstration Talking Points

For the current demonstration:

- Academic workspace isolation, public Sheet import, tracker population, form publishing, workspace-scoped roster selection, local response handling, review UX, adviser UX, and archive preparation can be shown.
- The backend database already persists imported academic data and tracker operations.
- Student account claims demonstrate the intended dashboard flow but are not yet institutionally verified.
- Automatic Drive checks, Gemini evaluation, real Google Sheet writeback, and independent archive storage require external credentials or services.
- Browser-local response and review state was retained temporarily so the team could validate the complete Sir-facing workflow before finalizing production persistence and security.
