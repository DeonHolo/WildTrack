# CapVault V2 UI, Roles, and Data Changes

Date: 2026-07-26

This document captures the planned changes, confirmed decisions, and open discussion points for the next CapVault V2 pass. Items marked **CONFIRMED** are ready to implement. Items marked **NEEDS DECISION** require a final call before implementation.

---

## 1. View Switching: Dev Preview vs Real Navigation

### Problem

The sidebar currently shows "Adviser View" and "Student View" as regular navigation items with the same styling as real tabs like "Command Center", "Forms", and "Tracker". This makes them look like official parts of the app, but they exist for dev/demo purposes — to let the team preview what different roles would see.

Current sidebar navigation in `ui.jsx`:

```
Command Center
Forms
Tracker
Review
Adviser View      ← looks like a real tab
Archive
Workspace
Student View      ← looks like a real tab
```

### CONFIRMED Decision

Move dev/demo view links into a **collapsible "Dev Tools" section** at the bottom of the sidebar:

- Visually separated from the real navigation (smaller text, muted color, dotted border above it).
- Collapsible so it can be hidden during actual demos to stakeholders.
- Clearly labeled as "Dev Preview" or "Dev Tools" so no one mistakes these for real app features.
- Contains links to preview Adviser View and Student View/Dashboard.

Mockup of the new sidebar structure:

```
Command Center
Forms
Tracker
Review
Archive
Workspace
─ ─ ─ ─ ─ ─ ─ ─ ─ ─     ← dotted separator
▸ Dev Preview              ← collapsible header
    Preview: Adviser
    Preview: Student
    Open sample form
```

### Implementation Notes

- The "Open student form" link currently in the topbar should also move into Dev Preview.
- When real auth is implemented, this entire section gets removed and replaced by actual role-based route guards.
- The collapsible state can be stored in `localStorage` so it stays open/closed across reloads during development.

---

## 2. User Roles

### CONFIRMED Decision

CapVault V2 has **three user roles**:

| Role | Description |
|------|-------------|
| **Teacher/Admin** | Sir Ralph — full access to everything. Can also be an adviser to specific teams. |
| **Adviser** | Assigned to specific teams only. Sees only their teams' submissions, tracker rows, and review tasks. |
| **Student** | Optional account. Can view their own submissions, tracker values, and feedback. Cannot see other students' data. |

### Important Note About Overlapping Roles

Sir Ralph is both Teacher/Admin AND an Adviser. The system must handle this:

- As **Teacher/Admin**, he sees the full class-wide "Review" tab with all submissions.
- As **Adviser**, he also has access to a team-filtered view for his assigned teams.
- A real adviser (who is not also a teacher) should only see the team-filtered view.

---

## 3. Tab Visibility Per Role and the Adviser View Naming

### Problem

There was a naming and overlap issue between two current tabs:

- **Review** (`/review`) — Shows ALL submissions across ALL students and teams. Admin-level review queue. Sir can trigger AI checks, accept submissions, give feedback.
- **Adviser View** (`/adviser`) — Shows submissions filtered by assigned team only. Intended for advisers to see just their teams' progress.

Issues:

1. "Adviser View" sounds like a dev preview toggle, not a legitimate navigation tab.
2. For a real adviser (not Sir), the "Review" tab would be redundant because they only ever see their own teams.
3. The Adviser View already functions as a review surface — it shows submissions by team with feedback and check capabilities.

### CONFIRMED Decision: Rename "Adviser View" → "Team Review"

"Team Review" communicates what the tab does (review submissions organized by team) and works for both Sir and real advisers. It no longer sounds like a debug feature.

### CONFIRMED: Tab Visibility Per Role

**Teacher/Admin (Sir Ralph):**

```
Command Center    ← full class overview and attention queue
Forms             ← publish, edit, unpublish deliverable forms
Tracker           ← full class tracker table
Review            ← all submissions, class-wide review queue
Team Review       ← filtered view for Sir's adviser assignments
Archive           ← final archive preparation
Workspace         ← Sheet connections, column mapping, templates, maintenance
```

**Adviser (real adviser, not also a teacher):**

```
Team Review       ← their only review surface, filtered to assigned teams
```

Advisers do NOT see the admin "Review" tab, Forms, Workspace, or Archive. If later it makes sense for advisers to also see a filtered Tracker for their teams, that can be added as a follow-up.

**Student:**

```
No sidebar — uses the public-page layout.
Student Dashboard ← their own submissions, tracker values, team tracker, feedback
```

The student never sees the admin sidebar navigation. They use the `PublicHeader` component which links to Student Dashboard and Sign in / Register.

---

## 4. Students Seeing the Team Tracker

### CONFIRMED Decision: Option B — Team-only tracker view

Students can see their own team's tracker rows but NOT the entire class.

Reasoning:

- The Student Dashboard (`/student`) already shows the student's OWN tracker values as milestone chips. Adding a team tracker table gives more context.
- Sir already shares the Google Sheet tracker publicly — students can already see everyone's lateness numbers through that Sheet link anyway. But CapVault does not need to replicate full-class visibility.
- Social accountability within the team — seeing that a teammate is missing submissions can motivate action.
- If later we decide "actually show everything," it is easy to lift the team-only restriction.

### Implementation Approach: Team Tracker in Student Dashboard

Since the Student Dashboard has no sidebar (it uses the `PublicHeader` layout, not `AppShell`), the team tracker should be added as a **new section within the Student Dashboard page itself** — NOT as a separate `/tracker` route.

The Student Dashboard would gain a new panel below the existing "Tracker values" chip grid:

```
┌─────────────────────────────────────────────────────────┐
│  Team Tracker                                           │
│  Your team's progress across all deliverables.          │
│                                                         │
│  ┌────────────┬────────┬─────┬─────┬─────┬─────┐       │
│  │ Name       │ Member │ SRS │ SDD │ RRL │ ... │       │
│  ├────────────┼────────┼─────┼─────┼─────┼─────┤       │
│  │ You (bold) │ 1      │ 0   │ 0   │ 9   │     │       │
│  │ Teammate A │ 2      │ 1   │ 10  │ 0   │     │       │
│  │ Teammate B │ 3      │ 0   │ 0   │ 0   │     │       │
│  └────────────┴────────┴─────┴─────┴─────┴─────┘       │
└─────────────────────────────────────────────────────────┘
```

The current student's own row should be visually highlighted (bold name, light background, or a "You" indicator). The table is read-only — no edit actions.

This avoids the problem of needing a sidebar for students. The team tracker section lives inside the existing Student Dashboard page alongside the existing panels.

---

## 5. Login and Authentication Status

### Current State: Demo/Placeholder Auth

The current registration and login system is **entirely browser-side using `localStorage`**. There is no backend authentication.

What exists now:

- `RegisterPage.jsx` saves student accounts to `localStorage` under the `capvault.v2.workflow` key.
- The "Continue with Google" button runs the same `localStorage` logic — it does NOT call Google OAuth. It just records `authMethod: 'Google'` in the local account object.
- `loginStudentAccount` looks up accounts by email in `localStorage`. There is no password verification (the password field exists in the form but is not checked against anything).
- There are no backend endpoints for auth, no JWT tokens, no session cookies.
- `activeStudentNumber` is stored in `localStorage` to persist the "logged in" student across page reloads.

What this means for the team:

- Accounts are local to each browser. Registering on one machine does not create an account visible to other machines.
- There is no security — anyone can "log in" by typing any email that was previously registered in that browser.
- The "Continue with Google" button is cosmetic only.

### CONFIRMED Decision

Document this as placeholder auth. Plan real auth separately but do not implement it in this pass.

### Future Auth Plan (Document Only, Do Not Implement)

When real authentication is built, it should include:

1. **Backend auth endpoints:**
   - `POST /api/auth/register` — create account with email + password or Google OAuth token.
   - `POST /api/auth/login` — authenticate and return a session token or JWT.
   - `POST /api/auth/google` — exchange Google OAuth token for a CapVault session.
   - `GET /api/auth/me` — return the current user's profile and role.
   - `POST /api/auth/logout` — invalidate session.

2. **Google OAuth integration:**
   - Use Google Sign-In on the frontend to get an ID token.
   - Send the ID token to the backend for verification.
   - Backend creates or links the account.
   - Student Number claiming happens separately after registration (see Item 6).

3. **Role assignment:**
   - Teacher/Admin role is assigned manually or by a seed/config.
   - Adviser role is assigned by the Teacher/Admin or derived from the class record.
   - Student role is the default for new registrations.

4. **Route guards:**
   - Replace the current open routing with role-based guards.
   - Students cannot access `/forms`, `/workspace`, `/review`, etc.
   - Advisers can only access their filtered views.
   - Public routes (`/submit/:slug`, `/register`, `/login`) remain open.

---

## 6. Student Number Field in Registration

### Problem

The Register form currently requires a Student Number during registration. This creates friction because:

- Most students will likely use "Continue with Google" which is a quick OAuth flow — stopping to search for a Student Number breaks that flow.
- The Student Number is not part of the student's Google account — it comes from the class record.
- It only makes sense to claim a Student Number after the student has an account, not during the account creation step.

### CONFIRMED Decision

**Remove Student Number from the Register form.** Move Student Number claiming to the Student Dashboard.

### New Registration Flow

1. Student registers with email/password OR Continue with Google.
2. Account is created (no Student Number linked yet).
3. Student is redirected to the Student Dashboard.
4. Student Dashboard shows a **persistent banner/prompt** at the top:

   ```
   ┌─────────────────────────────────────────────────────────────┐
   │  ⚠ Link your Student Number                                │
   │  Select your Student Number from the class record to see    │
   │  your submissions, tracker values, and feedback.            │
   │                                                             │
   │  [Student Number searchable selector]    [Claim]            │
   └─────────────────────────────────────────────────────────────┘
   ```

5. Once claimed, the banner disappears and the dashboard shows the student's data.
6. Claimed Student Numbers are hidden from other students' selectors (existing behavior, just moved from Register to Dashboard).

### What Stays in the Register Form

- Email field.
- Password field (for email-only registration).
- "Continue with Google" button.
- Brief explanation that accounts are optional.

### What Gets Removed from the Register Form

- Student Number searchable selector.
- The "Class record match" identity card preview.
- The helper text about unclaimed Student Numbers.

---

## 7. Confirmation Modals for Workspace Maintenance

### Problem

The "Refresh backend data" and "Restore starter data" buttons in the Workspace Maintenance section currently execute immediately with no confirmation. "Restore starter data" is destructive — it wipes all imported data and returns to the seed dataset.

### CONFIRMED Decision

#### Refresh Backend Data — Simple Confirmation Modal

```
┌─────────────────────────────────────────────────┐
│  Refresh backend data?                          │
│                                                 │
│  This will reload students, tracker rows,       │
│  tracker columns, project metadata, and         │
│  deliverables from the backend database.        │
│                                                 │
│  Local-only data (submissions, reviews,         │
│  archives) will not be affected.                │
│                                                 │
│              [Cancel]    [Refresh]               │
└─────────────────────────────────────────────────┘
```

#### Restore Starter Data — Destructive Confirmation Modal (Type to Confirm)

Uses the GitHub-style "type to confirm" pattern. The user must type `RESET` to enable the confirm button.

```
┌─────────────────────────────────────────────────┐
│  ⚠ Restore starter data?                       │
│                                                 │
│  This will replace ALL current data with the    │
│  built-in starter dataset. You will lose:       │
│                                                 │
│  • All imported Sheet data                      │
│  • All submissions and responses                │
│  • All registered student accounts              │
│  • All review notes and feedback                │
│  • All archive records                          │
│                                                 │
│  Backend auto-refresh will be disabled until     │
│  you import a Sheet again.                      │
│                                                 │
│  Type RESET to confirm:                         │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│        [Cancel]    [Restore] (disabled)          │
└─────────────────────────────────────────────────┘
```

The "Restore" button stays disabled until the text input exactly matches `RESET`.

---

## 8. Starter Data Source URLs

### Problem

In the current seed data (`seedData.js`), the Tracker source has a pre-filled URL (`https://docs.google.com/spreadsheets/d/class-record`) while Team Formation and Software Project Monitor have empty strings. This causes the Workspace page to show inconsistent states — the Tracker card has text in the URL field while the other two show placeholder text.

### CONFIRMED Decision

Clear ALL three source URLs in the starter data so they all show placeholder text consistently. Change in `seedData.js`:

```diff
 sources: {
   teamFormation: {
     name: 'Team Formation',
-    sheetUrl: '',
+    sheetUrl: '',         // stays empty
     status: 'Starter data',
     connectedAt: '',
     csvUrl: ''
   },
   tracker: {
     name: 'Tracker',
-    sheetUrl: 'https://docs.google.com/spreadsheets/d/class-record',
+    sheetUrl: '',         // was pre-filled, now cleared
     status: 'Starter data',
-    connectedAt: '2026-06-18T00:00:00+08:00',
+    connectedAt: '',
     csvUrl: ''
   },
   projectMonitor: {
     name: 'Software Project Monitor',
-    sheetUrl: '',
+    sheetUrl: '',         // stays empty
     status: 'Starter data',
     connectedAt: '',
     csvUrl: ''
   }
 }
```

Also update the top-level `sheetUrl` in `classRecord`:

```diff
 classRecord: {
   name: 'ClassRec SEM2 2025-26 : IT332 Tracker',
-  sheetUrl: 'https://docs.google.com/spreadsheets/d/class-record',
+  sheetUrl: '',
```

---

## 9. Filipino Starter Data

### Problem

The current seed data uses what appears to be real student names, real student numbers, and real group codes (e.g., `TAGHOY, RON LUIGI F.`, `20-0649-750`, `2526-sem2-it332-41`). During demos and development, this can be confused with actual class data.

### CONFIRMED Decision

Replace student names, student numbers, and adviser names with clearly fake but realistic Filipino academic data. Keep the following unchanged:

- Deliverable/milestone names: `SRS`, `SDD`, `ProbExploration`, `Convergence`, `RRL`, etc. — these are real academic terms and should stay.
- Team code format: keep the `XXXX-semX-it332-XX` pattern but use different numbers.
- Section name: keep `IT332`.
- Milestone values (lateness numbers): keep similar values for realistic demo data.

### New Seed Data Names

Replace the current 6 students with clearly fake Filipino names:

| Old Name | New Name | Old Student No. | New Student No. |
|----------|----------|-----------------|-----------------|
| TAGHOY, RON LUIGI F. | DELA CRUZ, JUAN CARLOS M. | 20-0649-750 | 22-1001-001 |
| BARANGAN, MARK LORENZ L. | SANTOS, MARIA ANGELA R. | 23-2250-144 | 23-2002-002 |
| PACIO, MURIEL D. | REYES, MIGUEL ANTONIO D. | 21-0845-312 | 21-3003-003 |
| LIM, MICHELU TIA A. | GARCIA, ANA PATRICIA L. | 22-1021-641 | 22-4004-004 |
| NARANJO, ANA CLAIRE ELLEN R. | BAUTISTA, JOSE RAFAEL P. | 21-3320-018 | 21-5005-005 |
| RAMOS, JEREMIAH T. | TORRES, RICA MAE S. | 20-1188-702 | 20-6006-006 |

Replace adviser names:

| Old Adviser | New Adviser |
|-------------|-------------|
| Sir Ralph Laviste | Sir Roberto Villanueva |
| Engr. Mary Claire Esdrelon | Engr. Carmen Aquino |

Replace project metadata:

| Old | New |
|-----|-----|
| CapVault: A Google-first capstone submission... | StudyBuddy: A collaborative academic task manager... |
| Project monitoring sample record | QuickPark: A campus parking slot finder app |

### Important

The team code format stays similar but uses different group numbers:

| Old Team Code | New Team Code |
|---------------|---------------|
| 2526-sem2-it332-41 | 2526-sem2-it332-11 |
| 2526-sem2-it332-07 | 2526-sem2-it332-22 |
| 2526-sem2-it332-01 | 2526-sem2-it332-33 |
| 2526-sem2-it332-02 | 2526-sem2-it332-44 |
| 2526-sem2-it332-04 | 2526-sem2-it332-55 |

---

## 10. What "Accepted" Means in the Review Process

### Current Behavior

In `ReviewPage.jsx`, each submission row has an "Accept" button. When pressed, it calls `markAccepted(response.id)` which sets:

```js
primaryStatus: 'Accepted'
reviewStatus: 'Accepted'
flags: [...flags, 'Accepted']
```

The "Archive" button is only enabled when `reviewStatus === 'Accepted'`. So the current flow is:

```
Submission → AI Review → Accept → Archive
```

### What "Accepted" Is Intended To Mean

"Accepted" is Sir Ralph's stamp that says: **"I have reviewed this submission and it is satisfactory for this deliverable."**

It does NOT mean:
- The student gets a grade (CapVault is not a grading system).
- The document is perfect.
- The submission is automatically archived.

It DOES mean:
- Sir (or an authorized adviser) has personally reviewed the submitted file.
- The submission meets the minimum requirements for the deliverable (it is a real PDF, it has real content, it is not just the template).
- The submission is eligible for final archiving.
- The student can see "Accepted" status in their dashboard, giving them confidence their work was received and reviewed.

### The Review Lifecycle (Full Status Flow)

```
┌──────────┐    ┌───────────────┐    ┌──────────┐    ┌──────────┐
│ Received │ →  │ Needs Review  │ →  │ Accepted │ →  │ Archived │
└──────────┘    └───────────────┘    └──────────┘    └──────────┘
     │                │                    │
     │                │                    ↓
     │                │              ┌───────────┐
     │                │              │ Unaccept  │ (reverts to
     │                │              │ (revoke)  │  Needs Review)
     │                │              └───────────┘
     │                │
     ↓                ↓
   (AI Review runs, flags set)
```

Status meanings:

| Status | Meaning |
|--------|---------|
| **Received** | Submission recorded but no review action taken yet. |
| **Needs Review** | AI check ran and found flags, OR Sir has not accepted yet. |
| **Accepted** | Sir explicitly approved. Eligible for archive. |
| **Archived** | Final PDF bytes captured with SHA-256. End of lifecycle. |

---

## 11. Unaccept (Revoke Acceptance) Feature

### Problem

Currently there is no way to revoke an "Accepted" status in the Review page. Once Sir presses Accept, it is permanent. This is dangerous because:

1. Sir might accept the wrong submission by mistake.
2. A student might edit their Google Drive file after acceptance (the file is not locked).
3. Sir might realize after acceptance that the submission was actually template-like or had issues he missed.
4. If a submission is accepted but not yet archived, there should be a window to revoke.

### CONFIRMED Decision: Add Unaccept

Implementation notes:

1. Add an "Unaccept" or "Revoke" button that appears on submissions with `reviewStatus === 'Accepted'` and `archiveStatus !== 'Archived'`.
2. Clicking Unaccept should show a small confirmation (simple modal, not type-to-confirm — this is a soft action, not destructive data loss).
3. Unaccept sets the status back to `Needs Review`.
4. If a submission is already **Archived**, Unaccept should be disabled or hidden. Once archived, the acceptance is final (the PDF bytes are already captured).
5. Activity log should record: "Revoked acceptance for [deliverable] — [student name]."

The Unaccept button should be styled as a secondary/warning action — not as prominent as the Accept button.

---

## 12. Archive Confirmation Modals and "Archive All" Button

### Problem

The current Archive flow has two issues:

1. The individual "Archive" button on each submission in Review executes immediately with no confirmation.
2. There is no bulk "Archive All" action for end-of-semester processing. Archiving happens near the end of the semester for final versions — Sir should not have to click Archive one by one for every accepted submission.

### CONFIRMED Decision

#### Individual Archive — Confirmation Modal

When Sir clicks "Archive" on a single submission in the Review page, show a confirmation modal detailing the student, deliverable, and team.

#### "Archive All Accepted" — Bulk Action with Confirmation Modal

Add an "Archive All Accepted" button to the **Archive page**. This archives all submissions that have `reviewStatus === 'Accepted'` and `archiveStatus !== 'Archived'`.

Confirmation modal (type-to-confirm): The user must type `ARCHIVE` to confirm.

---

## 13. Collapsible Saved Feedback in Team Review

### Problem

In the Team Review page, the "Saved Feedback" section under a selected deliverable displays all entries as plain text, pushing other content out of view.

### CONFIRMED Decision

Make the Saved Feedback section collapsible:
1. Show the **first feedback entry** with a preview (truncated).
2. Add a "Show all feedback (N)" toggle button to expand the full list.
3. Each individual entry should also be truncatable ("Read more" / "Show less").
4. Use `max-height` and `overflow-y: auto` for the expanded state.

---

## 14. Student View Button Styling

### Problem

Buttons in the Student Dashboard lack consistent borders and styling.

### CONFIRMED Decision

Apply standard `<Button>` component or `btn` class styling to all interactive elements (hero link, file links, edit links, tab buttons) to ensure visual consistency.

---

## 15. Student Tracker Implementation Approach

### Problem

Deciding how to show tracker data to students without giving them full access to the class spreadsheet.

### CONFIRMED Decision

Implement a **Team-only tracker table** section directly inside the Student Dashboard. This fetches only the rows associated with the student's team code, filtering out other teams' data and sensitive class-wide information.

---

## 16. Review Tab Filter Cleanup: "Needs Action" vs "Unchecked"

### Problem

The Review page has 5 filter tabs: `Needs Action`, `Unchecked`, `Flagged`, `All`, `Accepted`. The first two sound nearly identical to a user.

Here's what each actually does in the code:

| Filter | Logic |
|--------|-------|
| **Needs Action** | `reviewStatus !== 'Accepted'` AND (`!isAiReportCurrent(response)` OR `reviewStatus === 'Needs Review'` OR has attention flags) |
| **Unchecked** | `!isAiReportCurrent(response)` — meaning AI Review has never been run, or the student updated their response after the last AI Review |
| **Flagged** | Has flags like `Template-like`, `Too Short`, `Not PDF`, `Inaccessible` |

The problem: **"Needs Action" is a superset that includes all "Unchecked" responses**. If a response is Unchecked, it also appears in Needs Action. If a response was checked but has flags, it also appears in Needs Action. So "Needs Action" = "Unchecked" + "Flagged" + anything not yet Accepted.

For Sir, the distinction between "I haven't run AI Review yet" vs "Something needs my attention" is not clear from these labels.

### CONFIRMED Decision: Use four filters

Use these four filters:

| New Filter | Replaces | Meaning |
|------------|----------|---------|
| **Pending** | Needs Action + Unchecked | Everything that is NOT Accepted yet (the default working queue) |
| **Flagged** | Flagged (unchanged) | Submissions with specific attention flags |
| **All** | All (unchanged) | Everything regardless of status |
| **Accepted** | Accepted (unchanged) | Submissions Sir has approved |

`Pending` is the default working queue. It intentionally includes submissions that have not been checked yet and submissions that need follow-up, so Sir does not have to decide between two overlapping labels before he can start working.

---

## 17. File Check / AI Review: What's Real and What's Fake

### Previous Placeholder Behavior (Removed July 26)

This section preserves the audit trail for the misleading behavior that existed before the confirmed fix. The current UI no longer performs these steps or shows these claims.

#### What the old code did (`triggerAiEvaluation` in `WorkflowContext.jsx`):

```
1. Reads the EXISTING flags on the response (flags that were set at submission time)
2. Picks a CANNED summary string based on those flags:
   - If "Template-like" flag exists → "File opens, but several sections appear close to the provided template."
   - If "Too Short" flag exists → "File opens, but extracted content appears too short."
   - Otherwise → "File opens and contains readable capstone sections."
3. Sets aiReport.status = 'Current'
4. That's it.
```

#### What the app still does NOT do:

- ❌ Does NOT actually open the Google Drive link
- ❌ Does NOT check if the link is accessible
- ❌ Does NOT download or read the PDF
- ❌ Does NOT extract text from the PDF
- ❌ Does NOT compare against official templates
- ❌ Does NOT call any AI/Gemini API
- ❌ Does NOT detect if the file is empty, blank, or unchanged

Before the fix, a seed response with a fake Drive link could claim "File opens and contains readable capstone sections" because:

1. The seed data has flags `['Received', 'PDF OK', 'Needs Review']`
2. None of those flags are `Template-like` or `Too Short`
3. So it falls through to the default canned message
4. It literally makes up that the file is readable — **it never checked**

### Where the old flags came from

Before the fix, flags were set at **submission time** by `deriveAttemptFlags()` in `workflow.js`:

```js
export function deriveAttemptFlags(values, baseFlags) {
  const flags = [...baseFlags];
  const combined = Object.values(values).join(' ').toLowerCase();
  if (combined.includes('template')) flags.push('Template-like');  // ← searches the URL TEXT
  if (combined.includes('blank')) flags.push('Too Short');         // ← searches the URL TEXT
  return flags;
}
```

That URL-string behavior has been removed. `deriveAttemptFlags()` now preserves only factual form-validation results and does not invent content flags from words inside the submitted URL.

### What was discussed in the docs (but never implemented)

The SDD and Change Instructions docs describe a **two-tier checking system**:

**Tier 1: Automatic checks (no AI needed, should run at submission time or shortly after):**

1. Is the Google Drive link accessible?
2. Is the file actually a PDF? (MIME type check via Drive API)
3. Can text be extracted from the PDF?
4. Is the file empty or extremely short?
5. Is the file just the unchanged official template? (text comparison against stored template)

**Tier 2: AI-powered review (manually triggered by Sir):**

1. Short summary of document content
2. Red flags (missing sections, weak content)
3. Whether diagrams/figures are present when expected
4. Similarity to template beyond simple text matching
5. Suggested action

### CONFIRMED Decision: Make the unavailable state explicit

**Option A: Fix the placeholder to at least be honest**

Change the placeholder AI Review so it does NOT claim things it didn't check. Instead of "File opens and contains readable capstone sections," show something like:

- "No real file check was performed. This is placeholder behavior."
- Or show a breakdown: "Link accessibility: Not checked | PDF type: Not checked | Content: Not checked | Template match: Not checked"

This way nobody gets confused during demos.

**Option B: Implement Tier 1 checks (non-AI) on the backend**

This is what the Backend Phase 4 plan describes. The backend would:

1. Take the Drive link, call Google Drive API to get file metadata
2. Check MIME type (`application/pdf`)
3. Check accessibility
4. Download and extract text
5. Compare against stored templates

This requires actual Google Drive API credentials and backend work.

**Option C: Do Option A now, document Option B for later**

Make the placeholder honest so demos aren't misleading, and document what real checking should look like for a future phase.

Implemented decision: the local UI says automatic file checks and AI review are unavailable until Google Drive API is connected. It does not claim that a file opens, is a valid PDF, contains readable content, or resembles a template. The form may only say that a Drive-shaped link was provided.

---

## 18. July 26 Discussion: Tier 1 File Checks and Adviser Acceptance

### Tier 1: Current Technical Position

The existing backend can import public Google Sheets and write tracker values when Google Sheets credentials are configured. It does **not** yet contain a Google Drive API client, a PDF text extraction library, submission persistence, or a file-check endpoint. The frontend now records AI Review as `Unavailable` and shows the Google Drive API requirement instead of manufacturing a report from saved flags.

Proper Tier 1 checking needs this backend slice:

1. Extract and validate a Google Drive file ID from the submitted link.
2. Read Drive file metadata and verify that the file is accessible and has the `application/pdf` MIME type.
3. Download the PDF through the Drive API, only when Drive reports that downloading is allowed.
4. Verify that the PDF can be parsed and extract its text.
5. Store a factual result: accessible or inaccessible, PDF or not PDF, readable or unreadable, text length, and the checked file revision/timestamp.
6. When an official template exists for that deliverable, extract template text too and calculate a conservative template-overlap signal.

This is medium-sized backend work, not a cosmetic frontend change. The metadata/PDF/accessibility portion is a reasonable first implementation once a Google Cloud project, Drive API, and service-account or OAuth access approach are ready. Template comparison is the harder part because template PDFs need their own extraction and the result must be phrased as `possible template overlap`, never as a verdict that the student did no work. A very short text result is also a warning, not proof of an empty PDF, because diagrams and scanned pages may contain little extractable text.

### Tier 1 Recommendation

Do both in sequence:

1. **Immediately make the current placeholder honest.** Replace invented claims such as "File opens and contains readable capstone sections" with a visible message that Google Drive API is not connected and no file check was performed.
2. **Defer real Tier 1 until the team is ready to configure Google Drive API credentials.** It has no Gemini usage cost and directly addresses Sir's main pain: opening dead links, wrong file types, blank/unreadable PDFs, and submissions that are mostly unchanged templates.

Tier 2 Gemini review remains a manual action after Tier 1 establishes that there is an accessible, readable PDF. Gemini should summarize content and compare it against the deliverable instructions/template; it should not be the first or only validation layer.

### CONFIRMED Adviser Acceptance Permission and UI

Advisers should be able to accept the latest group output for deliverables in teams assigned to them. This fits the role: advisers already review their own teams, add feedback, and know whether a deliverable is ready.

The action should be **group-deliverable scoped**, not one accept button per individual student response. Team Review already selects one team and shows one latest group response per deliverable. The selected-detail panel should add a prominent `Accept group output` action next to the review result, with a confirmation showing the team, deliverable, and submitted link. It should record the adviser name and timestamp.

The class-wide Review page should then show `Accepted by [adviser]` in its reviewer/status column. Sir can see the decision without re-reviewing every file, revoke it when necessary, and retain the class-wide queue for exceptions. Adviser acceptance should not grant an adviser Archive access; the final independent PDF archive remains Sir/Admin-only.

An adviser-accepted submission is immediately eligible for archive, but only Sir/Admin can create the permanent archival copy. This avoids duplicate approval clicks while leaving the permanent archival copy under Sir's control.

---

## 19. Summary: Decisions Tracker

| # | Item | Status | Decision |
|---|------|--------|----------|
| 1 | View switching UI | ✅ IMPLEMENTED | One persistent floating Dev Preview overlay is mounted at the app root and available from every route. Embedded sidebar/header versions were removed. |
| 2 | User roles | ✅ CONFIRMED | Teacher/Admin, Adviser, Student (3 roles) |
| 3a | Rename "Adviser View" | ✅ CONFIRMED | Rename to "Team Review" |
| 3b | Tab visibility per role | ✅ IMPLEMENTED | Teacher/Admin keeps all tabs. Adviser has Team Review plus an assigned-team read-only Tracker. Student has no staff sidebar. |
| 4 | Student team tracker | ✅ CONFIRMED | Team-only tracker table inside Student Dashboard |
| 5 | Auth status docs | ✅ CONFIRMED | Document current localStorage auth as placeholder; plan real auth separately |
| 6 | Student Number in Register | ✅ CONFIRMED | Remove from Register; add claiming prompt in Student Dashboard |
| 7a | Refresh Backend Data modal | ✅ CONFIRMED | Simple confirmation modal |
| 7b | Restore Starter Data modal | ✅ FIXED | The modal makes `RESET` visually unmistakable. Empty restored timestamps no longer crash Workspace, and reset explicitly preserves Admin navigation. |
| 8 | Starter data source URLs | ✅ CONFIRMED | Clear all three URLs for consistency |
| 9 | Filipino starter data | ✅ CONFIRMED | Replace names, student numbers, adviser names only; keep academic terms |
| 10 | "Accepted" status meaning | ✅ DOCUMENTED | Sir's stamp that submission is satisfactory; gates archiving |
| 11 | Unaccept feature | ✅ CONFIRMED | Add Revoke button with simple confirmation modal; disabled after Archive |
| 12a | Individual Archive modal | PARTIAL | Confirmation exists, but current archive output is only a browser-local metadata record and source link. It is not an independent PDF copy. |
| 12b | Archive All Accepted | PARTIAL | Bulk local archive records exist. Real independent file preservation and byte-level verification remain unimplemented. |
| 13 | Collapsible feedback in Team Review | ✅ CONFIRMED | Truncated preview + "Show all" toggle + per-entry "Read more" |
| 14 | Student View layout and button styling | ✅ FIXED | Deliverable rows use stable responsive areas for identity, status, message/feedback, and actions. Desktop, tablet, and mobile layouts were browser-verified. |
| 16 | Review filter cleanup | CONFIRMED | Use `Pending / Flagged / All / Accepted`; Pending is the default queue |
| 17 | File Check / AI Review honesty | CONFIRMED | Show Google Drive API not connected; defer real Tier 1 until Drive API access is configured |
| 18 | Adviser acceptance | CONFIRMED | Advisers accept the latest group output for their teams; Sir/Admin retains archive action |

---

## Open Questions Awaiting Decision

1. **Tier 1 timing:** When the team is ready to configure a Google Cloud project and Google Drive API credentials, real Tier 1 is the next backend feature. See Section 18.

---

## 20. Implementation Audit: July 26, 2026

This audit compares the confirmed decisions above against the current frontend and backend code. `Implemented` means the behavior exists in the product. `Partial` means a portion exists but the user-facing workflow or safety behavior is incomplete. `Deferred` means the decision intentionally depends on work outside this pass.

| Item | Decision | Current code status | Audit result |
|------|----------|---------------------|--------------|
| 1 | Global Dev Preview | One route-independent floating control now switches among Admin, Adviser, Student, and sample-form views without occupying product navigation. | Implemented and browser-verified |
| 2 | Three roles | Admin, Adviser, and Student views exist, but there is no secure backend account role model or access control. | UI implemented; real role enforcement deferred |
| 3a | Rename Adviser View to Team Review | `Team Review` is a normal staff page and a normal Admin/Sir sidebar tab. `Adviser View` is now the Dev Preview role switch, not the page name. | Implemented |
| 3b | Role-specific tab visibility | Admin View shows the full staff sidebar. Adviser View shows Team Review and Tracker; Tracker rows are limited to teams assigned to the selected preview adviser. | Implemented for Dev Preview; security deferred |
| 4 and 15 | Team-only tracker in Student Dashboard | The dashboard shows personal tracker values followed by a read-only tracker table limited to the student's team, with the current row highlighted. | Implemented |
| 5 | Honest placeholder-auth documentation | The document accurately records the current browser-local auth limitations. | Implemented as documentation |
| 6 | Move Student Number claim from Register to Dashboard | Registration creates an unclaimed account. Student Dashboard claims one available Team Formation record and prevents duplicate Student Number ownership. A claimed account shows its Student Number as read-only. | Implemented locally |
| 7a | Confirm Refresh Backend Data | Refresh opens a confirmation dialog describing which backend-owned datasets are replaced. | Implemented |
| 7b | Type `RESET` before Restore Starter Data | The required word is displayed prominently above the input. Reset returns preview state to Admin and date formatting tolerates the empty connection timestamp in starter data. | Fixed and browser-verified |
| 8 | Clear all starter Sheet URLs | Team Formation, Tracker, and Software Project Monitor starter URLs are empty. | Implemented |
| 9 | Replace real-looking seed identities | Starter students, IDs, projects, and advisers use clearly fabricated Filipino testing records while academic labels remain intact. | Implemented |
| 10 | Acceptance lifecycle | Accept records reviewer name, role, scope, timestamp, and source response timestamp. Team Review and class-wide Review display reviewer attribution. Edited responses clear prior acceptance. | Implemented locally |
| 11 | Revoke acceptance | Class-wide Review shows Revoke for accepted, unarchived responses and requires confirmation. Archived responses cannot be revoked. | Implemented |
| 12a | Confirm individual archive | Archive opens a confirmation showing student, deliverable, team, and response timestamp. | Implemented with local archive records |
| 12b | Archive all accepted | Archive page shows the eligible count and requires typing `ARCHIVE` before creating all remaining accepted archive records. | Implemented with local archive records |
| 13 | Collapsible saved feedback | Team Review shows the latest entry first, supports Show all, clamps long feedback, and provides per-entry Read more/less controls. | Implemented |
| 14 | Responsive Student Dashboard rows | Identity, status, actions, summary, and feedback occupy deliberate grid areas and stack predictably at smaller breakpoints. | Fixed and browser-verified |
| 16 | `Pending / Flagged / All / Accepted` filters | Review uses the four confirmed filter tabs, with `Pending` as the default. | Implemented |
| 17 | Honest file-check placeholder | The current code removes fake URL-derived file claims and states that Google Drive API is not connected. | Implemented; current build passes |
| 18 | Adviser accepts group output | Team Review accepts the latest response for the selected team/deliverable after confirmation. Class-wide Review shows who accepted it; only Admin/Sir can archive. | Implemented locally |

### Audit Conclusion

The confirmed local-workflow batch is now implemented. The frontend production build passes, and the backend test suite passes all nine tests.

Two constraints must remain visible while implementing the batch:

1. Real role guards cannot be claimed until backend authentication exists. The current Admin, Adviser, and Student switcher is explicitly a local Dev Preview, not security.
2. Archive actions currently create browser-local workflow records and hash response metadata. Independent PDF download, storage, and byte-level SHA-256 verification still require Google Drive API and archive storage.
3. Automatic file checks and AI Review remain unavailable until Google Drive API is connected. The UI no longer claims that a submitted file was inspected.

---

## 21. July 26 Follow-up: Global Role Preview, Adviser Scope, Reset Bugs, Student Layout, and Real Archive

This section records the complete follow-up batch. None of these items should be treated as resolved merely because an earlier implementation audit marked a related item as implemented.

### 21.1 Dev Preview Must Be Global and Route-Independent

**User concern**

The current Dev Preview control is embedded inside the staff sidebar and separately embedded inside public headers. This forces each layout to reserve product UI space for a development-only tool and creates friction when moving among Admin, Adviser, Student, Register, Sign In, and public submission views.

**Revised direction**

Use one development-only floating overlay that is mounted at the application root and remains available on every route:

- Admin pages
- Adviser pages
- Student Dashboard
- Sign In
- Register
- Public submission forms
- Error and empty routes where practical

The control should not be part of the sidebar or public header. It should be a small fixed trigger near a screen corner, expand into a compact role/view menu, and remember its collapsed state. It must stay above page content without covering primary buttons, form controls, mobile navigation, or browser scrollbars. It should be removable through a development environment flag before a real deployment.

The menu should expose:

- Admin View
- Adviser View
- Student View
- Open sample form

**Status: IMPLEMENTED AND BROWSER-VERIFIED.**

### 21.2 Adviser Navigation and Tracker Access

**Previously recorded conflict**

The role description says advisers see their assigned teams' submissions, tracker rows, and review tasks. A later tab-visibility section says advisers see only Team Review and treats Tracker access as a possible follow-up. These two statements conflict.

**Recommended resolution**

Advisers should have two real tabs:

1. `Team Review` - group-deliverable submissions, AI Review availability, acceptance, and feedback for assigned teams.
2. `Tracker` - read-only tracker data limited to students in assigned teams.

The Adviser Tracker should reuse the same tracker interface instead of creating a separate tracker page, but its dataset must be scoped by adviser assignments. It should not expose Admin editing, Sheet import/sync, class-wide rows outside the adviser's assignments, or maintenance controls.

Sir Ralph's Admin View continues to show the class-wide Tracker. When he enters Adviser View, the same page demonstrates the assigned-team scope.

**Status: CONFIRMED AND IMPLEMENTED FOR DEV PREVIEW. Real backend role enforcement remains deferred.**

### 21.3 Restore Starter Data Removes Workspace and the Reset Prompt Is Unclear

**Observed major bug**

After restoring starter data, Workspace disappears from the visible Admin navigation. Starter-data restoration must reset workflow data only; it must not change the active preview role to Adviser or Student, remove role-visible routes, or corrupt navigation state.

**Required investigation and correction**

- Separate workflow seed state from UI preview-role state.
- Preserve the current Admin preview role when restoring starter data, or deliberately return to Admin View after restoration.
- Confirm that Workspace, Forms, Tracker, Review, Team Review, Archive, and Command Center remain visible afterward.
- Test reset from Admin, Adviser, Student, and public-form routes.

**Root cause found during browser verification**

The reset restored an empty `connectedAt` value. `formatDateTime()` attempted to format that empty value and threw a `RangeError`, which blanked the Workspace route and made the page appear to be gone. The formatter now handles empty or malformed dates safely, and Workspace shows `No live Sheet connection yet` for starter data.

**Reset confirmation copy**

The destructive confirmation must clearly tell the user what to enter. The required word must appear as a visually distinct instruction, for example:

`Type RESET below to restore starter data.`

`RESET` should be bold and/or displayed in a small code-style block directly above the confirmation input. The input label or placeholder should reinforce the same instruction. The confirm action remains disabled until the exact value is entered.

**Status: FIXED AND BROWSER-VERIFIED.**

### 21.4 Team Review Accept Button Contrast

**Observed bug**

`Accept Group Output` uses dark text on a green background and does not meet readable contrast expectations.

**Required correction**

Use the established primary action treatment already used by readable actions on the page: light text on the solid green background, with matching hover, focus, disabled, and pressed states. Do not introduce a one-off button style.

**Status: FIXED AND BROWSER-VERIFIED.**

### 21.5 Student Dashboard Deliverable Row Overlap

**Observed major layout problem**

The screenshot shows the status area, summary text, submitted-link action, and edit action competing for width inside one deliverable row. At narrower desktop widths, text wraps unpredictably and controls crowd or overlap. This is not acceptable for variable-length deliverable names, summaries, adviser feedback, or translated text.

**Required redesign criteria**

- Do not solve this with smaller text or squeezed button padding.
- Use stable columns with responsive minimum widths.
- Keep the deliverable identity and due date together.
- Keep the primary status and secondary validation state in a bounded status area.
- Clamp summary/feedback previews and open full text in the existing modal/detail interaction.
- Keep `Open submitted file link` and `Edit response` together in a non-overlapping action area.
- At narrower widths, deliberately stack content into clear rows instead of allowing accidental wrapping.
- Verify with long deliverable names, long summaries, adviser feedback, and both one-action and two-action states.

**Status: FIXED AND BROWSER-VERIFIED AT DESKTOP, TABLET, AND MOBILE WIDTHS.**

### 21.6 Archive: Current Reality vs Intended Preservation

**Current implementation**

The current Archive action does not download or preserve the submitted PDF. It creates a browser-local archive metadata record containing:

- Response and deliverable metadata
- Team/student/project details
- Original submitted Drive link
- A generated storage-key string
- A hash derived from response metadata
- A local `Archived` status

This is useful for demonstrating the workflow, but it is not a real archive. The hash is not a SHA-256 hash of independently stored PDF bytes, and the record still depends on the student's Drive link for file access.

**Intended archive from the pivot documents**

The final archive should preserve its own immutable copy of the accepted final PDF so it remains available even if the student edits permissions, replaces the file, deletes it, or loses the account. The real flow should:

1. Use Google Drive API to retrieve the accepted PDF.
2. Verify that it is a downloadable PDF.
3. Store the PDF bytes in storage controlled by CapVault or the institution.
4. Compute SHA-256 from those exact stored bytes.
5. Save archive metadata in the backend database and, if useful, an index in Google Sheets.
6. Support later download and hash verification from the archived copy.
7. Optionally create a Google Drive mirror for staff convenience, but never treat the student's original link as the archive.

**Recommended storage direction**

Use an S3-compatible object store for the independent production copy, with Cloudflare R2 as the preferred hosted option and local filesystem storage for development. Google Drive can remain an optional institutional mirror. This is closer to the previous archive architecture and satisfies the requirement that the archive not rely on a student's mutable Drive link.

If the team instead decides that a copy placed in an institution-controlled Google Drive is sufficiently independent, that is a simpler Google-first alternative, but it is still a copied file owned by the institution - not merely the submitted link.

**Status: CURRENT FEATURE IS A LOCAL WORKFLOW PLACEHOLDER. Cloudflare R2 is the planned independent storage destination but is not configured or simulated yet.**

### 21.7 Follow-up Batch Checklist

| # | Concern | Current status | Next decision/action |
|---|---------|----------------|----------------------|
| 1 | Dev Preview embedded in multiple layouts | Implemented | Global floating overlay replaces embedded controls |
| 2 | Adviser tab access, especially Tracker | Implemented locally | Team Review + assigned-team read-only Tracker |
| 3 | Workspace disappears after starter-data restore | Fixed | Defensive date formatting and Admin-role preservation |
| 4 | Reset confirmation does not clearly show `RESET` | Fixed | Exact word is prominent above the confirmation field |
| 5 | Accept Group Output contrast | Fixed | Standard primary action contrast and inherited button text styling |
| 6 | Student Dashboard row overlap | Fixed | Responsive grid areas verified at desktop, tablet, and mobile widths |
| 7 | Archive only stores local metadata/source link | Clearly disclosed | Professional not-configured state names Cloudflare R2 as planned storage |

---

## Implementation Reminder

Before implementing, resolve the open questions above. Once all items are CONFIRMED, use this document as the checklist. Do not silently simplify these requirements. If any item is too large, ask what to defer.

---

## 22. July 26 Discussion: Source-Aware Imports, Starter Deliverables, Tracker Updates, Deadline Detection, and IT/CS Workspaces

This section records the complete discussion batch before implementation. None of the items below should be marked fixed merely because the current importer accepts a Sheet URL or returns some rows. A successful HTTP request is not enough; each source must prove that it contained the data CapVault expected from that source.

### 22.1 Source-Specific Import Summaries and Missing-Data Warnings

**User concern**

The same Sheet can currently be pasted into Team Formation, Tracker, or Software Project Monitor and still appear to import something. The import modal does not clearly say whether the expected fields for the selected source were found. This makes a partial or incorrect import look successful.

**Current behavior found in code**

- The frontend chooses a parser based on the import button that was pressed.
- Team Formation looks for Student Number, student name, team code, member number, email, section, and adviser.
- Tracker looks for identity columns plus all remaining columns, which it treats as tracker/deliverable columns. It imports each student's raw cell values.
- Software Project Monitor looks for group code, project title, software name, description, proposal remarks, demo comments, adviser/status, and category.
- The backend returns one generic response shape containing `studentsFound`, `officialIdsFound`, `groupsFound`, `columnsFound`, warnings, and deadline suggestions for every source.
- The frontend checks whether those generic keys exist, not whether they are relevant. Because the keys always exist, a Software Project Monitor summary can incorrectly show Students, Official IDs, Columns, and Deadline Rows even when those values are merely zero.
- The importer currently has no minimum source signature that rejects a Sheet which clearly belongs to another source.

**Required redesign**

Each source needs its own validation contract and its own summary layout.

#### Team Formation summary

Show:

- Students found
- Official Student Numbers found
- Teams found
- Member numbers found
- CIT/institutional emails found
- Header row used
- Skipped rows

Warn clearly when any expected identity field is absent:

- `Student Number column not found`
- `Student name column not found`
- `Team code column not found`
- `Member number column not found`
- `Institutional email column not found`

Student Number, student name, and team code are required for a usable Team Formation import. Missing optional fields can remain warnings.

#### Tracker summary

Show:

- Student rows found
- Tracker/deliverable columns found
- Raw progress cells imported
- Rows matched to Team Formation
- Rows not matched to Team Formation
- Deadline rows found
- Deadline values found
- Suggested forms
- Header row used
- Skipped rows

Warn clearly when:

- Student name was not found
- Team code was not found
- Member number was not found
- No tracker/deliverable columns were found
- No raw progress values were found
- No rows matched the Team Formation roster
- No deadline row was detected

An absent deadline row should normally be an informational warning, not a failed import, because Sir may intentionally maintain deadlines elsewhere. Missing identity columns or zero tracker columns should make the import fail validation instead of claiming success.

#### Software Project Monitor summary

Show:

- Groups found
- Project titles found
- Software names found
- Descriptions found
- Adviser assignments found
- Proposal remarks found
- Demo comments found
- Categories found
- Header row used
- Skipped rows

Warn clearly when:

- Group code was not found
- Project title was not found
- Software name was not found
- Adviser/status was not found
- No imported group matched a Tracker or Team Formation team code

Do not show Students, Official IDs, Tracker Columns, or Deadline Rows in this summary.

**Recommended import result states**

- `Imported` - the required signature and usable records were found.
- `Imported with warnings` - the required data was found, but optional fields or matches were missing.
- `Wrong source or incomplete Sheet` - the selected source's required signature was not found. Do not apply the imported records.

**Status: DISCUSSED, NOT IMPLEMENTED.**

### 22.2 Starter Deliverable Columns and Form Generation

**Current truth**

Starter data currently preloads all nine Tracker columns:

1. ProbExploration
2. Convergence
3. RRL
4. Project Proposal
5. SRS
6. SDD
7. Adviser Assessment
8. SourceCode
9. DEMO

Starter data separately preloads only three published forms:

1. SRS
2. SDD
3. Software Project Documentation, mapped to SourceCode

Importing a Tracker does **not** automatically create forms. The import can detect deadline values and present a `Generate suggested forms` action. Forms are created or updated only when Sir presses that action.

The generator already uses one form per Tracker column. If a form for that Tracker column exists, it updates the existing form rather than intentionally creating a second one.

**Proposed testing change**

Reduce starter Tracker columns to a deliberately small set so it is visually obvious when a real Tracker import replaces/populates them. A recommended starter set is:

- SRS
- SDD
- SourceCode

Keep only enough starter students, forms, responses, and tracker values to test Student, Adviser, Review, and Archive flows. The Workspace should label these as starter records so they cannot be mistaken for a successful Sheet import.

Do not automatically generate forms immediately after import. Keep the summary-and-confirmation step because Sir must be able to review detected deadlines, PDF requirements, titles, and mappings before publishing student-facing links. A future convenience action may say `Generate all suggested forms`, but it should remain explicit.

**Status: CURRENT BEHAVIOR VERIFIED; STARTER-DATA REDUCTION PROPOSED, NOT IMPLEMENTED.**

### 22.3 Tracker Number Meaning and Submission Update Behavior

**Meaning of the number**

- `0` means the response was saved on or before the form's due date and time.
- A positive integer means the number of calendar-day-sized 24-hour periods after the deadline, rounded upward.
- Example: one minute after the deadline becomes `1`, and 24 hours plus one minute becomes `2`.
- Blank means no tracked response/value exists.
- `#N/A`, dates, `DONE`, and other raw values remain valid Sheet values and are not converted into lateness numbers unless CapVault writes a response result into a mapped deliverable cell.

**What the current flow does**

When a public response is first submitted or meaningfully edited:

1. CapVault finds the student and the form's mapped Tracker column.
2. It calculates days late using the current save timestamp.
3. It immediately updates that student's Tracker value in browser-local frontend state.
4. It sends the workspace, student, deliverable column, value, and Sheet target to the backend tracker-writeback endpoint.
5. The backend updates its workspace-scoped Tracker cell and records the remote writeback attempt.
6. The Tracker screen reflects the new value immediately in the same browser.
7. If an existing response is opened and saved without changing identity or field values, it returns the existing response and does not recalculate lateness.
8. If the response data changes, the new save timestamp becomes the basis of the lateness value, matching the agreed Google Forms `Edit response` behavior.

**Current persistence boundary**

- Response content/history is still browser-local.
- Tracker cells and writeback attempts are backend-persisted.
- Sir's real Google Sheet is not changed without Google Sheets API credentials.
- Without credentials, the backend records `PENDING_GOOGLE_CREDENTIALS` and the UI tells the submitter that the local tracker changed but remote sync is waiting.

**Required end-to-end behavior**

After a real changed response:

1. Calculate lateness using the form deadline and changed-response timestamp. **Implemented.**
2. Update the backend tracker cell immediately. **Implemented.**
3. Attempt Google Sheet writeback. **Implemented when credentials are available; otherwise queued as pending.**
4. Display whether the result is local/backend only, written to Google Sheet, or waiting for credentials/retry. **Implemented.**
5. Never block the student's submission merely because Sheet writeback failed. **Implemented.**
6. Save the full response/history in the backend. **Still pending.**

**Status: IMPLEMENTED FOR BACKEND TRACKER CELLS. FORM SUBMISSION UPDATES THE WORKSPACE-SCOPED BACKEND TRACKER CELL IMMEDIATELY. GOOGLE SHEET WRITEBACK IS RECORDED AS `PENDING_GOOGLE_CREDENTIALS` UNTIL SHEETS API CREDENTIALS ARE CONFIGURED.**

### 22.4 Deadline-Row Detection and Incorrect Generic Summaries

**Confirmed summary bug**

Software Project Monitor currently receives the same generic metric keys as Tracker and Team Formation. This is why its modal shows Students, Official IDs, Groups, Columns, and Deadline Rows. That output is not source-aware and must be replaced by the source-specific summaries in Section 22.1.

**Current deadline detector**

The Tracker parser:

1. Finds the best header row within the first 20 rows.
2. Treats non-identity headers as Tracker columns.
3. Scans rows **after** the header row.
4. For any row without both student name and team code, it checks the Tracker-column cells for recognizable dates.
5. It currently recognizes `M/d/yyyy`, `M/d/yy`, full/short English month formats, ISO dates, and values that contain `Date | Time`.
6. Each recognized date becomes a suggested form due at `11:59 PM`.

**Live Tracker result**

The public Tracker Sheet was imported through the running frontend and backend. The importer found:

- 318 student rows
- 10 deliverable columns
- 3,145 raw progress values
- 318 matched roster entries
- One skipped non-student row containing 10 deadline timestamps

The deadline parser now recognizes Sir's exact bottom-row format, including values such as `2/14/2026 23:59:59`. These values produced ten ordered form suggestions at `11:59 PM`.

**Required diagnostics**

The Tracker import summary should include:

- Detected header row number and header names
- Detected identity-column mapping
- Detected Tracker-column names
- Candidate non-student rows inspected for deadlines
- Raw deadline candidate values
- Parsed deadline values
- Rejected deadline values with a short reason
- Source tab/GID used

This diagnostic information can be shown in a collapsible `Import details` section so Sir sees a clean summary by default while the team can still diagnose a changed Sheet.

**Status: IMPLEMENTED. IMPORT SUMMARIES ARE SOURCE-SPECIFIC, EXPECTED/MISSING FIELDS ARE REPORTED, AND THE LIVE TRACKER DEADLINE ROW IS DETECTED.**

### 22.5 Supporting IT and CS in One CapVault Installation

**User need**

Sir Ralph handles IT and CS. He should not need separate apps or deployments. After he has connected each class's source Sheets, one control should switch the entire visible dataset between them.

**Plausibility**

This is highly plausible, but it should not be implemented as two copies of browser-local state. It is a first-class data-partitioning feature and affects every entity and query.

#### Option A: Browser-local profiles

Store two separate local workflow objects and switch between them.

Advantages:

- Fastest for a local demonstration.

Problems:

- No real multi-user safety.
- Data remains tied to one browser.
- Easy to leak or overwrite records across profiles.
- Does not solve backend, authentication, adviser, archive, or Google Sheet separation.

**Score: 3/10. Not recommended except as a disposable prototype.**

#### Option B: First-class academic workspaces

Create an `AcademicWorkspace` for each actual class context. Every record is scoped by `workspaceId`.

Example workspaces:

- `IT332 - IT - Semester 1 - 2026-27`
- `CS Capstone - CS - Semester 1 - 2026-27`

Each workspace owns:

- Team Formation source
- Tracker source
- Software Project Monitor source
- Students and teams
- Tracker columns, rows, and cells
- Project metadata
- Deliverables and published forms
- Responses and response history
- Templates
- Adviser assignments and feedback
- Tracker writebacks
- Archive records and storage prefixes

Sir uses a compact workspace switcher in the persistent staff header. Switching workspaces changes all counts, forms, tracker rows, reviews, adviser assignments, and archives together. The current workspace remains visible in the page header to prevent accidental work in the wrong class.

Advantages:

- One installation and one login.
- Clean separation between IT, CS, sections, and future semesters.
- Scales beyond exactly two datasets.
- Matches real database and access-control needs.

Cost:

- Requires a database migration and repository/API scoping.
- Current tables use global uniqueness for Sheet source type, tracker column key, Student Number, group code, and form slug. Those constraints must become workspace-scoped.
- Frontend state and routes must carry or remember the active workspace.

**Score: 9/10. Recommended.**

#### Option C: Separate deployments or databases

Run one CapVault for IT and another for CS.

Advantages:

- Strong physical isolation.

Problems:

- Duplicate setup, deployment, updates, credentials, and maintenance.
- Sir cannot switch classes smoothly.
- Cross-class reporting becomes difficult.

**Score: 4/10. Not recommended for Sir's workflow.**

**Recommended model**

Use Option B, but define a workspace by **program + course/section + semester**, not merely `IT` or `CS`. Sir may handle multiple IT or CS sections and future semesters; a two-value program toggle would become another limitation immediately.

**Required safeguards**

- Every backend query and mutation requires a workspace ID.
- Student Number ownership is unique within a workspace/term, not necessarily across all history.
- Form links resolve to exactly one workspace and deliverable.
- Sheet source mappings are stored per workspace.
- Adviser assignments and permissions are workspace-scoped.
- Archive storage keys begin with workspace and term identifiers.
- Importing or switching workspaces cannot carry unsaved form settings into another workspace.
- Destructive reset/archive actions display the current workspace name.
- The top-level switcher cannot switch while an import or destructive action is in progress.

**Implemented decision**

The first UI immediately supports any number of named workspaces. IT and CS examples are seeded for convenience, but Sir can create additional program/course/section/term workspaces without a code change. Backend records, imported sources, students, tracker data, projects, deliverables, form links, and browser state are scoped to the selected workspace.

**Status: IMPLEMENTED WITH BACKEND WORKSPACE ISOLATION, A GLOBAL SWITCHER, WORKSPACE CREATION, AND WORKSPACE-SCOPED PUBLIC FORM LINKS.**

### 22.6 Implementation Order and Current Result

1. Add source-specific import validation and summaries. **Implemented.**
2. Add deadline detection and test against Sir's live public Tracker. **Implemented.**
3. Reduce starter Tracker columns/forms to a small, unmistakable testing set. **Implemented.**
4. Wire public response saving to tracker writeback. **Tracker writeback implemented; full backend response persistence remains.**
5. Add first-class Academic Workspaces and migrate operational data to workspace scope. **Implemented.**
6. Add the workspace switcher after backend isolation tests pass. **Implemented.**

### 22.7 Discussion Checklist

| # | Concern | Current finding | Status |
|---|---------|-----------------|--------|
| 1 | Import modal should report expected values that were not found | Source-specific summaries now report detected and missing fields | Implemented |
| 2 | Starter Deliverable Columns and automatic form creation | Starter data is reduced to three columns; detected deadlines produce explicit suggestions that Sir chooses to generate | Implemented |
| 3 | Tracker numbers and immediate updates | `0` is on time and positive values are days late; backend tracker cells update immediately while remote Sheets writes wait for credentials | Implemented locally/backend; remote credentials pending |
| 4 | Project Monitor summary and Tracker deadline row | Each source has its own metrics; Sir's exact bottom deadline row produces ten suggestions | Implemented and live-tested |
| 5 | One-button IT/CS data switching | First-class Academic Workspaces isolate any program, section, and term | Implemented |

## 23. July 26 Implementation Result

This batch moved the workspace/import/form/tracker path from a browser-only concept to a workspace-scoped backend flow.

### 23.1 Branding and Registration

- Product-facing branding now says `CapVault`.
- The registration route is a focused account form rather than an explanatory split layout.
- Email/password registration remains available for the current flow.
- Google sign-in is labeled honestly as not connected; it does not pretend to create an authenticated Google session.

### 23.2 Academic Workspaces

- Sir can switch among academic workspaces from the persistent staff header.
- Sir can create additional workspaces using program, course/section, semester, and academic year.
- IT and CS are examples, not hardcoded limits.
- Workspace sources and imported operational records are isolated by `workspaceId`.
- Student form links include the workspace ID so a form cannot silently resolve against another class.

### 23.3 Source-Aware Import

- Team Formation checks for Student Number, student name, and team code.
- Tracker checks identity columns and deliverable/progress columns.
- Software Project Monitor checks group code and project title metadata.
- Importing the wrong Sheet into a source no longer reports a misleading generic success.
- The modal reports source-specific counts, missing fields, warnings, and deadline/form suggestions.

### 23.4 Deadline Suggestions and Forms

- Tracker timestamps such as `2/14/2026 23:59:59` are parsed without replacing their real time.
- Suggested forms are ordered by due date and Tracker-column order.
- Suggestions remain visible in Workspace and Forms until Sir generates them.
- Form generation remains explicit; importing a Sheet does not publish student-facing forms without confirmation.
- Existing forms keep their stable slug and saved deadline when edited.

### 23.5 Tracker Update Boundary

- A changed public response calculates lateness against the deliverable deadline.
- The correct workspace/student/deliverable tracker cell is updated through the backend.
- A writeback record is created for the corresponding Google Sheet target.
- Without Google Sheets API credentials, the result is `PENDING_GOOGLE_CREDENTIALS`; the student response is not blocked.
- The app does not claim that Sir's remote Sheet changed when it did not.

### 23.6 Remaining External Integrations

- Real Google OAuth and account sessions
- Google Sheets API remote writeback credentials
- Google Drive API PDF metadata/content access
- Gemini document evaluation
- Cloudflare R2 independent archive copies
- Backend persistence for responses, feedback, reviews, AI reports, and archive records

## 24. July 26 Follow-up: Review Queue, Student Claims, Public Links, Archive Scale, and Reset Isolation

### 24.1 Accepted Work Leaves the Action Queue

- Accepted responses no longer count as `Unchecked`.
- Accepted responses no longer count as `Needs review` in the deliverable strip.
- Command Center excludes accepted and archived responses from the Action Queue.
- Accepted work remains visible through the `Accepted` Review filter and Archive Candidates.

### 24.2 Student Account and Workspace Claims

The browser-local account model now separates login identity from class-record identity:

- The email account is global across CapVault workspaces.
- Each account stores a separate Student Number claim for each academic workspace.
- Claim ownership is unique within a workspace.
- Claiming an IT Student Number does not claim or expose a CS Student Number.
- Switching to an unclaimed workspace shows the claim flow for that workspace.
- Switching back restores the existing workspace-specific profile.
- The claim flow uses one searchable selector and a confirmation dialog.
- After confirmation, the selector is replaced by a read-only profile showing name, email, Student Number, team, member number, and adviser.
- Logout is available from the persistent student header.

This remains browser-local identity behavior until real OAuth, backend accounts, sessions, and role enforcement are implemented.

### 24.3 Readable Public Form Links

New links use a readable workspace key instead of exposing the backend UUID:

```text
/w/it-it332-2025-26-semester-2/submit/week-9-srs
```

The deployed link uses the production origin automatically. The workspace key selects the correct academic workspace and the form slug selects the deliverable. Existing UUID links remain supported so previously copied links do not break.

### 24.4 Archive at Class Scale

The Archive page now uses:

- Search by project, team, student, adviser, or deliverable
- Team and deliverable filters
- 25-row pagination
- Compact index rows
- A selected-record detail band for planned storage key, record hash, adviser, date, and source actions
- Summary counts for recorded finals, waiting candidates, and independent copies

Long hashes and storage keys are no longer repeated across every row. The current archive still records metadata only; independent PDF copies remain blocked on archive storage integration.

### 24.5 Starter Data and Reset Isolation

- IT and CS both have clearly labeled starter data.
- CS starter identities, teams, advisers, and project names are distinct from IT while using the same starter deliverables.
- Resetting one workspace does not modify another workspace.
- A reset sets backend auto-refresh off for that workspace.
- Switching away and back respects the reset state instead of silently loading the previous backend import.
- Backend data returns only when Sir explicitly imports or chooses Refresh Backend Data.
