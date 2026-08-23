# WildTrack

WildTrack supports Sir Ralph Laviste's capstone workflow through public student submission forms, connected class records, tracker visibility, teacher/adviser review, and final archive preparation.

Current state: the UI is React/Vite and the backend is Spring Boot. Academic workspaces, Sheet imports, students, tracker data, project metadata, deliverables, official templates, tracker writeback attempts, and Document Check reports are backend-backed. Public responses, review notes, and archive actions still use browser storage while their backend modules are completed.

## Read This First

Before changing current behavior, read:

- `docs/WildTrack_UI_Rebrand_Specification.md`
- `docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`

The older planning documents remain in `docs/` as decision history. The current application and README use the WildTrack name.

The current direction is not the old login-first vault. The main workflow is:

1. Sir selects or creates an academic workspace for a program, course/section, and term.
2. Sir connects public Google Sheets for Team Formation, Tracker, and Software Project Monitoring.
3. WildTrack validates each source by its expected columns and summarizes what was found or missing.
4. Tracker deadline rows can generate suggested deliverable forms after Sir confirms them.
5. Sir publishes one form link per deliverable.
6. Students submit Google Drive PDF links through a public WildTrack form.
7. Student Number comes from Team Formation and auto-fills name/team when selected.
8. The tracker stores lateness values and submission state.
9. New and materially changed responses run Document Check for Drive access, PDF integrity, readable text, and template similarity when the local Drive API key is configured. Staff can also check pending documents in batches.
10. Final accepted PDFs are prepared for archive.

## Repository Layout

- `frontend/` - Current WildTrack React + Vite app.
- `backend/` - Spring Boot backend foundation for secure Google/API work.
- `docs/` - SRS, SDD, transcript notes, pivot notes, and current UX/action docs.
- `design-system/` - UI/UX rules for the app.
- `legacy/` - Old WildTrack implementation kept for reference only.

Do not build current WildTrack work inside `legacy/`.

## Requirements

Install these first:

- Git
- Node.js 20+ recommended
- npm, included with Node.js
- Java 21+
- Maven 3.9+

PostgreSQL is not required for the default local backend profile. The backend uses a local H2 database by default so teammates can run it immediately.

## First-Time Google Setup

WildTrack uses Google Identity Services for student sign-in and a restricted Google Drive API key for Document Check. The OAuth client ID is public browser configuration; the Drive API key stays in the Spring Boot backend. Never commit the Drive key or an OAuth client secret.

On each laptop that will run WildTrack:
1. Clone or pull the repository.
2. Open PowerShell in the repository root.
3. Run:

```powershell
.\setup-local.ps1
```

4. Paste that laptop's restricted Google Drive API key into the hidden prompt.
5. The script configures the shared WildTrack OAuth client ID for the frontend and backend. It does not need or store the OAuth client secret.
6. Start both services:

```powershell
.\run-local.ps1
```

The setup script stores the Drive key and Google identity settings in the current Windows user's environment. They are not copied into the repository, so each teammate's laptop must run the one-time setup. The same restricted key can be entered on the presentation laptop for local testing, but it must never be committed.

Stop both services with:

```powershell
.\stop-local.ps1
```

The launcher checks Java, Maven, Node, dependencies, ports, backend health, and frontend readiness before reporting success. Logs are written under ignored `logs/`.

## How To Run Locally: Backend And Frontend

Use the scripts above for the normal local workflow. The manual two-terminal workflow below remains useful for debugging.

Use two terminals from the repo root.

Terminal 1, backend:

```powershell
cd backend
mvn spring-boot:run
```

Terminal 2, frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Check the backend:

```text
http://127.0.0.1:8080/api/health
```

The frontend expects the backend at `http://127.0.0.1:8080/api` by default. If the backend is not running, Workspace import falls back to the frontend public-Sheet importer where possible. File checks and official template uploads always require the backend.

The default backend profile is `local`. It creates a local H2 database under `backend/data/`, which is intentionally ignored by Git. To run backend tests, use:

```powershell
cd backend
mvn test
```

## Run Backend With PostgreSQL

Create a PostgreSQL database, set the `postgres` profile and the connection variables expected by `backend/src/main/resources/application-postgres.yml`, then run `mvn spring-boot:run` from `backend/`. Existing backend environment-variable names are compatibility contracts and are intentionally not renamed during this frontend rebrand.

The same Flyway migrations run in both local and PostgreSQL profiles.

## Build And Preview

Use this before pushing larger UI or workflow changes:

```powershell
cd frontend
npm run build
npm run preview
```

Preview opens on the Vite preview URL printed in the terminal.

Run the automated checks from `frontend/`:

```powershell
npm test
npm run test:browser
npm run build
```

On a laptop running browser tests for the first time, install the local Chromium test browser once with `npx playwright install chromium`.

## Important Routes

- `/` - Command Center / teacher overview
- `/workspace` - Connect/import Team Formation, Tracker, and Software Project Monitor Sheets
- `/forms` - Publish, edit, unpublish, and copy/open deliverable form links
- `/w/:workspaceKey/submit/:slug` - Workspace-scoped public student submission form using a readable academic-workspace key
- `/submit/:slug` - Compatibility route for older local form links
- `/tracker` - Class-wide Admin tracker or assigned-team read-only Adviser tracker
- `/review` - Sir/teacher review view
- `/adviser` - Team Review; a normal Admin/Sir tab and the adviser-scoped review surface
- `/archive` - Final archive preparation
- `/student` - Student status/dashboard view
- `/register` - Optional student account registration/login flow

## How To Test The Main Demo Flow

1. Start the backend and frontend.
2. Go to `/workspace`.
3. Select or create the academic workspace you want to manage.
4. Import or refresh the three source Sheets:
   - Team Formation: Student Number, name, team code, member number, CIT account.
   - Tracker: deliverable columns and lateness values.
   - Software Project Monitor: project titles, software names, remarks, adviser/status, category.
5. Review the import summary. If Tracker deadlines were detected, use **Generate suggested forms**.
6. Go to `/forms`.
7. Publish or edit a deliverable form.
8. Open its generated `/w/{workspaceKey}/submit/...` link.
9. Select a Student Number, confirm auto-filled details, and submit a Drive PDF link.
10. Check `/tracker`, `/review`, `/adviser`, and `/student`.
11. In `/workspace`, upload a downloaded official DOCX or PDF template for the deliverable.
12. In `/review` or `/adviser`, run **Check file** on a response whose Drive PDF is shared as **Anyone with the link - Viewer** with downloads allowed.

Useful testing controls:

- The floating **Dev Preview** control stays available on every route and switches among Admin, Adviser, Student, and sample-form views.
- Admin shows all staff tabs. Adviser shows Team Review and an assigned-team read-only Tracker.
- `/workspace` -> **Refresh backend data** asks for confirmation before loading imported backend data into the frontend.
- `/workspace` -> **Restore starter data** requires typing `RESET`, then restores the browser-local testing dataset.
- `/tracker` -> **Load all rows** shows every tracker row at once; **Use pages** returns to 25 rows per page.
- `/tracker` -> **Summary** opens the hidden tracker value counts.

## Current Data Behavior

The app stores browser-side workflow state under workspace-specific keys derived from:

```text
wildtrack.v2.workflow
```

This means:

- Each academic workspace has isolated browser state and isolated backend records.
- Public form responses, adviser feedback, archive actions, and some UI choices are still local to the current browser.
- Other teammates will see backend-imported records when using the same backend database, but they will not yet share browser-local responses and feedback.
- If old test data appears, use **Restore starter data** in Workspace or clear the `localStorage` key in browser devtools.

Workspace imports now try the backend API first. If the backend is unavailable, the frontend falls back to the local public-Sheet importer so the demo can still run.

The backend currently persists academic workspaces, imported Sheet data, workspace source records, deliverable records, tracker rows/cells, tracker columns, project metadata, official template metadata/text, Document Check history, and tracker writeback attempts in the local H2 database. Uploaded template files are stored under ignored `backend/storage/templates/`.

Use **Refresh backend data** in Workspace to reload backend students, tracker rows, tracker columns, project metadata, and deliverables into the frontend.

Use **Restore starter data** in Workspace to return to the local starter dataset for testing. This disables backend auto-refresh until you import a Sheet again or press **Refresh backend data**.

## Current Integration Status

Working now:

- React + Vite frontend.
- Spring Boot backend foundation.
- Backend health endpoint: `GET /api/health`.
- Academic workspace endpoints:
  - `GET /api/workspaces`
  - `POST /api/workspaces`
  - `PUT /api/workspaces/{workspaceId}`
- Workspace selector for separate programs, sections, and terms.
- Workspace-scoped backend records and public form links.
- Backend workspace source endpoints:
  - `GET /api/workspace/sources?workspaceId={workspaceId}`
  - `PUT /api/workspace/sources/{sourceType}?workspaceId={workspaceId}`
- Backend deliverable endpoints:
  - `GET /api/deliverables`
  - `GET /api/deliverables/{id}`
  - `POST /api/deliverables`
  - `PUT /api/deliverables/{id}`
- Backend Sheet import endpoints:
  - `POST /api/sheets/import/TEAM_FORMATION?workspaceId={workspaceId}`
  - `POST /api/sheets/import/TRACKER?workspaceId={workspaceId}`
  - `POST /api/sheets/import/PROJECT_MONITOR?workspaceId={workspaceId}`
  - `GET /api/sheets/import-runs?workspaceId={workspaceId}`
- Backend imported data endpoints:
  - `GET /api/students`
  - `GET /api/projects`
  - `GET /api/tracker/columns`
  - `GET /api/tracker/rows`
  - `GET /api/tracker/writebacks`
- Backend tracker writeback endpoint:
  - `POST /api/tracker/writebacks`
- Google Drive and Document Check endpoints:
  - `GET /api/file-checks/status`
  - `POST /api/file-checks?workspaceId={workspaceId}`
  - `GET /api/file-checks/{responseId}?workspaceId={workspaceId}`
  - `GET /api/file-checks/{responseId}/history?workspaceId={workspaceId}`
- Official template endpoints:
  - `GET /api/templates?workspaceId={workspaceId}`
  - `POST /api/templates?workspaceId={workspaceId}`
  - `DELETE /api/templates/{id}?workspaceId={workspaceId}`
- Flyway database migrations.
- Local H2 profile and PostgreSQL-ready profile.
- Public/published Google Sheet import.
- Source-specific column validation and import summaries.
- Team Formation roster import.
- Tracker import with exact bottom-row deadline detection, including timestamps such as `2/14/2026 23:59:59`.
- Software Project Monitor import.
- Explicit suggested-form generation from detected Tracker deadlines.
- Frontend Workspace import calls the backend Sheet import endpoints first.
- Frontend Register, Forms, and Tracker screens can read backend-loaded students/tracker data after import or refresh.
- Workspace backend refresh and starter-data restore controls.
- Public student submission form flow.
- Optional account-first student registration followed by Student Number claiming in the Student Dashboard.
- One student account can be used across academic workspaces, while Student Number claims remain separate per workspace.
- Claimed students see a read-only profile summary; unclaimed students see one focused claim flow with confirmation.
- Student logout from the persistent public header.
- Teacher review, Team Review, student dashboard, tracker, and archive screens.
- A route-independent floating Admin/Adviser/Student Dev Preview for testing role-specific layouts.
- Tracker page with sticky selected-student band, sticky toolbar, sticky table header, toolbar search, paged rows, load-all-rows mode, and hidden summary counts.
- Student Dashboard with compact deliverable rows, group progress, team-only tracker, adviser feedback preview, full feedback modal, and `Reviewed` status when feedback exists.
- Published form editing/unpublishing flow that preserves responses in browser state.
- Readable public form URLs such as `/w/it-it332-2025-26-semester-2/submit/week-9-srs`.
- Adviser group-output acceptance with reviewer attribution in class-wide Review.
- Acceptance revocation before archive, single archive confirmation, and bulk archive confirmation requiring `ARCHIVE`.
- A clearly labeled archive-storage placeholder: current archive actions create local metadata records, while Cloudflare R2 is the planned independent PDF store.
- A searchable, filterable, paged Archive index with compact rows and selected-record details for hashes and planned storage keys.
- Restricted Google Drive API integration for public file metadata and PDF download.
- Document Check for Drive access, PDF MIME type, download permission, file size, corrupt/password-protected PDFs, page count, readable-text length, and official-template comparison.
- Per-deliverable DOCX/PDF official template upload, text extraction, replacement, removal, and deterministic template-similarity checks.
- Persisted Document Check reports and report history.

Not fully connected yet:

- Durable backend sessions and server-enforced student/adviser/admin authorization after Google sign-in.
- Google Sheets API writeback to Sir's actual Sheet, unless service-account credentials are configured.
- Google Docs API report creation.
- Real Gemini AI evaluation.
- Backend persistence for public submissions, reviews, feedback, archive records, and AI reports.
- Real account/session handling for students/advisers/admins.
- Cloudflare R2 or another S3-compatible archive connection, independent PDF copies, and byte-level SHA-256 verification.

Document Check is not generative AI. It performs deterministic Drive, PDF, readable-text, and official-template checks. If a laptop has not run `setup-local.ps1`, WildTrack reports **Not checked** rather than inventing findings. Gemini-based summaries and instruction-level evaluation remain a separate Admin-only AI Review capability.

## Demo Readiness And Known Limitations

WildTrack has a real backend database, but production persistence is only partially complete.

### What the database currently preserves

- Academic workspaces
- Connected Sheet sources and import runs
- Imported Team Formation students
- Tracker columns, rows, cells, and writeback attempts
- Software Project Monitoring metadata
- Deliverables

The default local profile stores these records in an ignored H2 file under `backend/data/`.

PostgreSQL is configured as the production target but is not required for the current local demonstration.

### What is demonstration-only or not connected

| Feature | Current behavior | Reason |
|---|---|---|
| Student Google sign-in | Google ID tokens are verified by the backend; the active account is remembered in the current browser | Durable server sessions, revocation, and cross-device account persistence are not implemented |
| Student Number connection | Browser-local and separate from Google identity | The current testing flow trusts the selected class-record identity; stronger institutional verification can be added later if Sir requires it |
| Admin/adviser permissions | Role-specific UI preview | Server-enforced RBAC and authenticated staff accounts are not implemented |
| Public responses and history | Stored in browser workflow state | The team validated the public submission UX before committing the final backend response model |
| Existing response links | Never prefilled on a public form | Selecting a Student Number alone must not reveal another student's Drive link |
| Response ownership | Private response details are matched by verified Google subject, workspace, deliverable, and Student Number | Durable ownership still requires backend response persistence and server sessions |
| Adviser feedback and review | Stored in browser workflow state | These require authenticated staff identity and backend response records |
| Google Drive Document Check | Working locally after `setup-local.ps1` | Requires a restricted Drive API key on each machine and public viewer access to each submitted file |
| Google Sheet writeback | Local/backend update with pending remote status | Actual Sheet changes require service-account credentials and Sheet permission |
| Gemini AI Review | Not connected; Document Check is working | Gemini still needs prompts, quotas, rate limits, a protected backend key, and Admin-only authorization |
| Final archive | Metadata record only | Independent PDF storage, byte-level SHA-256, and verification require Cloudflare R2 or another S3-compatible store |
| Notifications | Not connected | Durable in-app or email notifications depend on backend accounts, events, and delivery jobs |

### Student identity flow

Students do not create a separate WildTrack username or password. They continue with a Google account, and the Spring Boot backend verifies the Google ID token against WildTrack's OAuth client ID.

Google identity and class-record identity remain separate audit facts. After Google sign-in, the student chooses a Student Number from the active workspace's Team Formation data. WildTrack fills the matching name and team details, but the Google account remains the private owner used for dashboard data and response editing.

The Student Dashboard includes a self-service **Disconnect** action so a student can correct an accidental class-record connection without asking Sir to handle routine account cleanup. OTP and institutional Microsoft verification remain optional hardening measures if Sir requests them later.

Public submission forms require verified Google identity before class-record and Drive-link fields are shown. Selecting someone else's Student Number does not reveal that person's submitted link or private dashboard data.

## Public Form Links When Hosted
WildTrack does not need to store a hardcoded production domain. Form links are built from the website origin currently serving the app, a readable workspace key, and the stable deliverable form slug.

For example:

```text
https://wildtrack.example.edu/w/it-it332-2025-26-semester-2/submit/week-9-srs
```

- `https://wildtrack.example.edu` comes from the deployed website.
- `it-it332-2025-26-semester-2` identifies the academic workspace.
- `week-9-srs` identifies the published deliverable form.

The Copy Link control automatically uses the current origin, so local links use `http://127.0.0.1:5173` and hosted links use the production domain without a code change. Older UUID-based links remain resolvable for compatibility, but new links display the readable workspace key.

## API And Secret Rules

Do not put Google API keys, OAuth client secrets, Gemini keys, or service account credentials in the Vite frontend.

The Google OAuth client ID is public and is the only Google identity value exposed to Vite. The browser sends Google's signed ID credential to the Spring Boot backend, which validates it before WildTrack accepts the account.

Safe frontend environment values include VITE_API_BASE_URL and VITE_GOOGLE_CLIENT_ID. The OAuth client secret is not used by this browser flow.

Run setup-local.ps1 instead of typing the Drive key into a visible command. The script configures the existing Drive compatibility variables plus Google identity for the current Windows user. Gemini is not wired yet; its key must remain backend-only when added.

## Document Check Behavior
Document Check runs after a new or materially changed response and can also be started manually for pending or outdated responses. Batch checks use limited concurrency and skip current results.

Only fields configured as PDF Drive submissions use Document Check. Repository and other link-only fields are not sent through PDF validation. Because public responses are still browser-backed in this phase, closing the page during an automatic check can interrupt that request; the staff batch action can recover unchecked responses. Backend response persistence and a durable job queue are still required for production reliability.

It checks:

- The submitted URL is a Google Drive file link.
- The file is accessible through the Drive API.
- The Drive MIME type is `application/pdf`.
- Viewers are allowed to download it.
- The file is within the 25 MB local check limit.
- The downloaded bytes are a readable, non-password-protected PDF.
- Extracted text is not extremely short.
- If an official template exists for the deliverable, how much template text remains and how much new student content appears.

The template comparison is a screening signal, not a grading decision. Staff still open the submitted PDF before accepting it. Gemini AI Review will later provide richer summaries and instruction-level evaluation only when Admin/Sir explicitly starts an individual or selected-deliverable batch review.

## Backend Google Sheets Setup

Public Sheet import works without credentials when the Sheet is published or public. Real tracker writeback to Sir's actual Google Sheet needs Google Sheets API credentials.

For local testing with a service account:

1. Create or choose a Google Cloud project.
2. Enable the Google Sheets API.
3. Create a service account and download its JSON key.
4. Share Sir's target Google Sheet with the service account email.
5. Configure the service-account path using the environment variables expected by the backend Google Sheets configuration, then run `mvn spring-boot:run` from `backend/`.

Do not commit the service account JSON file.

If credentials are not configured, `POST /api/tracker/writebacks` still updates the backend tracker cell and records the writeback as `PENDING_GOOGLE_CREDENTIALS` when remote writing is requested.

## Development Notes

- Keep UI dense, table-first, and teacher-workflow focused.
- Avoid huge cards for high-volume screens like Review and Tracker.
- Keep Student public forms familiar to Google Forms, but cleaner.
- Do not reintroduce a required student-login workflow for submissions.
- Keep account registration optional for students.
- Student Number should come from Team Formation.
- Tracker values are days late: `0` means on time; positive numbers mean days late.
- Final archive should eventually preserve independent PDF copies, not rely only on student-owned Drive links.

## Troubleshooting

If `npm run dev` fails:

```powershell
cd frontend
npm install
npm run dev
```

If the page shows stale data:

- Use **Restore starter data** in Workspace, or
- Clear browser `localStorage` key `wildtrack.v2.workflow`.

If Student Numbers do not appear:

- Import the Team Formation Sheet in `/workspace`.
- Confirm the import summary reports official IDs found.
- Press **Refresh backend data** if the backend already imported the Sheet.
- Refresh `/register`, `/student`, or `/submit/...`.

If Tracker still shows starter rows:

- Go to `/workspace`.
- Press **Refresh backend data**.
- If you intentionally want local test data, press **Restore starter data**.

If Sheet import does not work:

- Confirm the Sheet is public or published.
- Paste the normal Google Sheets link or published link into the matching Workspace source.
- Import Team Formation, Tracker, and Software Project Monitor separately.
- Check that the backend is running if you want backend import persistence.

If `mvn spring-boot:run` fails:

- Confirm Java 21+ is installed: `java -version`.
- Confirm Maven is installed: `mvn -version`.
- Run tests first from `backend/`: `mvn test`.
- If port `8080` is busy, set another port: `$env:SERVER_PORT='8081'`.

## Legacy

The original WildTrack implementation is preserved under `legacy/`. Use it only for reference when recovering useful UX patterns or old behavior.
