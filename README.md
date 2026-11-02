# WildTrack

WildTrack manages capstone submissions, review and final records. Administrators import class data, publish forms, check submitted PDFs, review AI feedback and preserve accepted files. Students submit through shared forms and track their own records; advisers review their assigned teams.

> [!IMPORTANT]
> WildTrack is hosted for supervised evaluation at [www.wildtrack.dev](https://www.wildtrack.dev). AI Review provides advisory feedback. Staff make the review and acceptance decisions.

## Current features

| Area | What it does |
|---|---|
| Today's work | Lists submission changes, access problems, identity conflicts and records needing a staff action. |
| Workspace | Manages academic workspaces, source imports, staff access, official templates and Deadline PDF monitoring. |
| Forms | Publishes a submission form and share link for each deliverable. |
| Review | Combines deliverables in one sortable table, opens submission details and runs Document Check or AI Review individually or in batches. |
| My advised teams | Shows team outputs and review actions for assigned teams. An Admin preview of another adviser's teams is read-only. |
| Tracker | Shows imported class-record values alongside WildTrack submissions, with sortable columns. |
| Academic data | Edits Students, Teams / Projects and Deliverables. Includes live search, column and source-row sorting, paste, undo/redo, CSV exports and an all-data XLSX export. |
| Archive | Preserves accepted PDF copies, checks integrity, retries failed copies and unarchives records. Other submitted links are retained as metadata; their content is not copied. |

### Document Check and AI Review

Document Check checks Google Drive access, file type, PDF readability and whether the submission looks filled beyond the official template. It also checks template headings. It does not grade the content.

AI Review assesses the submitted PDF against deliverable instructions and an approved Review checklist. The report includes a document overview, short assessments, page references and supporting excerpts when available. Completed results use **No issues** or **Needs attention**; technical failures have separate statuses such as **Retry required**. A no-issues result applies to the checked areas and does not approve the submission.

For official templates, upload a PDF in **Workspace**, select **Prepare AI drafts**, then inspect the Review checklist alongside the Template PDF. Gemini drafts readable instructions and WildTrack retains their source excerpts. An administrator can edit, approve or unapprove the checklist. Approval is required for AI Review to use that checklist; Document Check does not require it. The approved wording stays fixed across student reviews until the checklist changes.

Gemini's assessment determines each checklist category. WildTrack checks supporting quotations separately against the submitted PDF's extracted text. A quotation match locates supporting words; it does not prove that the AI interpreted them correctly. An unmatched quotation does not automatically turn a positive assessment into a document concern. Tables, diagrams and image-based content still need staff judgment.

### Accounts and saved records

WildTrack uses the backend (Spring Boot on PostgreSQL / local H2) as the single source of truth for all critical workflow data:

- **Student account connection:** Students sign in with Google and verify their roster details through a shared deliverable form or the account connection page. The backend saves the account binding across devices and sessions. A first claim is self-declared and does not independently prove identity.
- **Identity collision resolution:** If a different Google account attempts to associate with an already-claimed Student Number, the system flags an open identity conflict. Administrators review competing claims in Today's Work and record an explicit decision (resolved or dismissed).
- **Account recovery:** An administrator can disconnect a mistaken binding. The student can then connect again with the intended Google account; existing submissions and history remain.
- **Durable staff and student sessions:** Both staff and student views provide explicit Log out controls that invalidate the server session, clear client state, and redirect unauthenticated access.
- **Scoped access:** Student access does not include a public roster or workspace directory. First-time form access uses an unguessable share link; existing connected students can sign in through the normal login page.

### Imports and monitoring

Workspace supports Google Sheet imports and one Excel workbook. Download the Excel template, fill the required Student Number, Student Name and Team Code fields on its Students tab, and use the optional Teams and Projects and Deliverables tabs as needed. Preview the import before applying it. Updated workbooks retain omitted rows, blank optional values, submissions, AI Review results, decisions and account links.

Deadline PDF monitoring checks selected deliverables for PDF changes or lost access. Checks run about hourly, or every five minutes from 24 hours before to 48 hours after a deadline in Philippine time. These are best-effort checks subject to Drive access and quotas. Monitoring does not run AI Review.

## Quick start on Windows

The supported local workflow uses the PowerShell scripts in the repository root. The launcher installs missing frontend packages, builds the backend, starts both services, checks that they are ready, and writes logs.

### 1. Install the requirements

Install:

- [Git](https://git-scm.com/download/win)
- [Node.js 20 or newer](https://nodejs.org/) — npm is included
- [Java 21 or newer](https://adoptium.net/)
- [Apache Maven 3.9 or newer](https://maven.apache.org/download.cgi)
- Windows PowerShell 5.1 or PowerShell 7

Open a new PowerShell window and check each installation:

```powershell
git --version
node --version
npm --version
java --version
mvn --version
```

PostgreSQL is not required for local use. The default backend uses an H2 database stored on the computer.

### 2. Download the project

For a new copy:

```powershell
git clone https://github.com/DeonHolo/WildTrack.git
cd WildTrack
git switch main
```

For an existing copy:

```powershell
git switch main
git pull --ff-only
```

Run the remaining commands from the repository root—the folder containing `setup-local.ps1`, `run-local.ps1`, `frontend`, and `backend`.

### 3. Configure Google services once

WildTrack uses Google sign-in and a restricted Google Drive API key for Document Check. Obtain the Drive API key for the project, then run:

```powershell
.\setup-local.ps1
```

Paste the key into the hidden prompt and press Enter. The script stores the Drive key, Google Drive switch, public OAuth client ID, and Google sign-in switch in the current Windows user's environment.

The key is not written to the repository. Never commit an API key, OAuth client secret, or service-account JSON file.

If PowerShell blocks the script, allow local scripts only for the current terminal and retry:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-local.ps1
```

Run setup once for every Windows user account that runs WildTrack. Run it again if the Drive API key changes.

### Optional: enable Gemini AI review

The backend uses `gemini-3.5-flash-lite` with minimal thinking by default. Without a key, AI review remains disabled.

Batch AI Review rechecks Drive access and file-version metadata. Verified PDF snapshots can be reused for 15 minutes within an 8 MiB memory cache and 64 MiB private temporary disk cache. Saved reviews are reused when the verified content and review settings match; the same link alone is not enough.
For local use, run `./setup-gemini.ps1` and enter your Gemini API key in the hidden prompt,
then restart WildTrack. For hosting, set the backend's secret `GEMINI_API_KEY` environment
variable and restart/deploy the updated backend. Never put it in frontend/Vercel browser
variables or commit it to a file. The example environment file is documentation, not an
automatically loaded secrets file.

The configured provider uses `gemini-3.5-flash-lite`, minimal thinking and an 8,192-token output ceiling per request. Long checklists are assessed in groups of up to 16 instructions; a document can require multiple requests. PDF inputs use Gemini's Files API where the provider's upload path applies. Template preparation and student review are separate operations.

AI Review All starts with a server-managed precheck that makes no Gemini request. Confirm the review scope separately. The batch runs on the server, so closing its dialog or leaving the page does not cancel it. **Stop after current document** preserves finished work and stops before another document starts. Individual failed attempts are recorded while remaining documents continue; temporary provider cooldowns can delay new requests. Failed or uncertain attempts require an explicit retry.

New Gemini requests are normally spaced at least 15 seconds apart per backend instance (`WILDTRACK_GEMINI_MINIMUM_INTERVAL_SECONDS`). Quotas depend on the API project. Rate limits and service failures can still occur; completed results remain saved. Changing or approving a template checklist can make an earlier review outdated. Check saved reviews before spending tokens on a retry.

The existing Google Drive configuration must also work so WildTrack can read submitted PDFs.
After adding the key, run AI Review on one representative submission to confirm provider access and inspect the feedback. Automated tests use simulated responses unless explicitly configured as live provider checks. Passing those tests does not establish review accuracy on real documents.

### 4. Start WildTrack

```powershell
.\run-local.ps1
```

The first start can take a few minutes because npm installs the frontend packages and Maven builds the backend. Wait for:

```text
WildTrack is ready.
```

Open the URLs printed by the launcher:

- Application: <http://127.0.0.1:5174/>
- Backend health check: <http://127.0.0.1:8080/api/health>

The terminal can be closed after the ready message. Both services run as background processes.

### 5. Try the local demo

The floating **Dev Preview** control switches between Admin, Adviser, Student, and sample-form views. It is a local demonstration control, not production authorization.

A basic workflow is:

1. Open **Workspace** and select or create an academic workspace.
2. Download and fill the Excel template in **Workspace**, or connect the Team Formation, Tracker and Software Project Monitoring Google Sheets.
3. Preview and apply the workbook, or import the source Sheets and inspect their validation summaries.
4. Generate suggested forms when Tracker deadlines are detected.
5. Open **Forms**, publish a deliverable, and copy its public form link.
6. Submit a Google Drive PDF link through the form.
7. Inspect the result in **Tracker**, **Review**, **My advised teams** and the **Student dashboard** with the appropriate role.
8. Upload an official Template PDF in **Workspace**. Prepare, inspect and approve its Review checklist before running template-based AI Review. Run Document Check separately.
9. Accept a designated sample response and archive it after configuring storage. Verify the preserved PDF, then unarchive the sample to inspect the lifecycle.

For Sheet import, the source must be public or published. For Document Check, share the PDF as **Anyone with the link — Viewer** and allow downloading.

### 6. Stop WildTrack

```powershell
.\stop-local.ps1
```

Use the stop script when possible. It closes both process trees and removes the local PID file.

## Everyday commands

Run these from the repository root:

| Task | Command |
|---|---|
| Start both services | `.\run-local.ps1` |
| Start without installing frontend packages | `.\run-local.ps1 -SkipInstall` |
| Use different ports | `.\run-local.ps1 -BackendPort 8081 -FrontendPort 5175` |
| Stop both services | `.\stop-local.ps1` |
| Read backend output | `Get-Content .\logs\backend.out.log -Tail 100` |
| Read backend errors | `Get-Content .\logs\backend.err.log -Tail 100` |
| Read frontend output | `Get-Content .\logs\frontend.out.log -Tail 100` |
| Read frontend errors | `Get-Content .\logs\frontend.err.log -Tail 100` |

The `logs` directory and `.wildtrack-local.pids.json` are local runtime files ignored by Git.

## Local data

The local backend stores database files under `backend/data/`. Uploaded official templates are stored under `backend/storage/templates/`. Both locations are ignored by Git.

The browser also stores the selected workspace and some UI/demo state. Two browsers can therefore show different selections while using the same backend database.

To restore the included sample workspace, open **Workspace** and select **Restore starter data**. The confirmation requires typing `RESET`.

To discard all backend data, stop WildTrack, back up anything important, then remove the contents of `backend/data/`. The database is recreated on the next start. This permanently removes local records.

## Run the services manually

The scripts are recommended. Use this two-terminal workflow when debugging one service at a time.

Terminal 1 — backend:

```powershell
cd backend
mvn spring-boot:run
```

Terminal 2 — frontend:

```powershell
cd frontend
npm install
npm run dev -- --port 5174
```

Open <http://127.0.0.1:5174/>. The frontend calls `http://127.0.0.1:8080/api` by default.

The manual workflow still needs the Google settings created by `setup-local.ps1`. If setup ran in another terminal, open new terminals so they inherit the saved Windows user environment.

## Run the checks

Backend tests:

```powershell
cd backend
mvn test
```

Frontend unit tests and production build:

```powershell
cd frontend
$env:VITE_GOOGLE_CLIENT_ID = ''
npm test
npm run build
```

The empty client ID keeps Google Identity Services disabled during component tests. It affects only the current PowerShell process.

## Configuration reference

The local scripts configure normal development values automatically.

| Variable | Purpose | Local value |
|---|---|---|
| `VITE_API_BASE_URL` | Frontend API base URL | `http://127.0.0.1:8080/api` |
| `VITE_GOOGLE_CLIENT_ID` | Public Google OAuth client ID | Set by `setup-local.ps1` |
| `WILDTRACK_GOOGLE_CLIENT_ID` | OAuth client ID accepted by the backend | Set by `setup-local.ps1` |
| `WILDTRACK_GOOGLE_IDENTITY_ENABLED` | Enables Google ID-token verification | `true` through the launcher |

The setup and launcher scripts also configure the backend-only Drive key, Drive integration switch, and allowed browser origins. Use the scripts instead of entering those values in a visible command.

Public Google Sheets can be imported without service-account credentials. Edits made through Academic data are saved in WildTrack; they do not write back to the source Sheet.

Archive storage is configured separately under `wildtrack.archive.storage`. Set a default destination and named destinations with type `local` or `drive`. Local storage needs a persistent directory; Drive storage needs a folder ID, OAuth client ID, client secret and refresh token. These credentials belong on the backend. Signing in to Drive in a browser does not authorize backend archive writes. See [ArchiveStorageProperties.java](backend/src/main/java/com/capvault/backend/archive/storage/ArchiveStorageProperties.java) for the configuration fields. Unarchiving keeps retained copies and history; the default Final archive view excludes inactive history.

## Troubleshooting

### A command is not found

Close and reopen PowerShell after installing Node.js, Java, or Maven. Then repeat the version checks in [Install the requirements](#1-install-the-requirements).

### PowerShell refuses to run a script

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

This changes the policy only for the current terminal.

### Google setup is missing

If the launcher reports that the Drive key or Google sign-in is not configured, run:

```powershell
.\setup-local.ps1
```

### Port 8080 or 5174 is already in use

First stop an earlier WildTrack session:

```powershell
.\stop-local.ps1
```

If another application owns the port, choose unused ports:

```powershell
.\run-local.ps1 -BackendPort 8081 -FrontendPort 5175
```

Use the application URL printed by the launcher.

### A service does not become ready

Read the error logs:

```powershell
Get-Content .\logs\backend.err.log -Tail 100
Get-Content .\logs\frontend.err.log -Tail 100
```

Also check <http://127.0.0.1:8080/api/health>. The launcher stops both services if either readiness check times out.

### Frontend packages are missing or damaged

```powershell
cd frontend
npm install
cd ..
.\run-local.ps1
```

### A student cannot connect their account

1. Confirm that the intended student is in the workspace roster imported through a workbook or Team Formation Sheet.
2. Check the Student Number, name and Team Code against that record. Unconnected students enter their details rather than browsing classmates' records.
3. Check for an existing binding to another Google account in **Today's work** account management.
4. For first-time form access, use the share link copied from **Forms**.

### Google Sheet import fails

- Confirm that the Sheet is public or published.
- Paste the normal Google Sheets URL or published URL into the matching source field.
- Import each Google Sheet into its matching source. For a single-file import, use the Excel template instead.
- Check the backend error log for the exact validation or network error.

### Document Check reports “Not checked” or cannot open a PDF

- Confirm that `setup-local.ps1` completed successfully.
- Confirm that the URL points to a Google Drive file, not a folder.
- Share the PDF as **Anyone with the link — Viewer**.
- Allow viewers to download the file.
- Confirm that it is a readable, non-password-protected PDF no larger than 25 MB.

## Production status

WildTrack is hosted for supervised evaluation at https://www.wildtrack.dev. Configure the backend Drive, Gemini and archive credentials when setting up another deployment.

The frontend is deployed on Vercel and the backend on Heroku with PostgreSQL. Follow the [deployment runbook](docs/deployment/deployment-runbook.md), check the configuration in [application-production.yml](backend/src/main/resources/application-production.yml), and use the [operations runbook](docs/deployment/operations-runbook.md) for recovery procedures. Review the current code and required credentials when using older deployment notes.

Archive storage supports local and Google Drive destinations through a provider interface. A hosted deployment needs persistent storage or a configured Drive destination; a Heroku dyno's temporary filesystem is not an archive destination. Provider availability, quotas and configured credentials affect file access and AI Review. Technical checks and saved reviews do not substitute for final user-validation evidence.

## Repository layout

- `frontend/` — React and Vite application.
- `backend/` — Spring Boot API, persistence, migrations, and integrations.
- `docs/` — requirements, design notes, and workflow specifications.
- `design-system/` — interface rules and visual guidance.
- `legacy/` — previous implementation kept for reference only.

Current WildTrack development belongs in `frontend/` and `backend/`, not `legacy/`.

For product and interface decisions, start with:

- [`docs/WildTrack_UI_Rebrand_Specification.md`](docs/WildTrack_UI_Rebrand_Specification.md)
- [`docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md`](docs/WildTrack_Student_Identity_Dashboard_And_Form_Design.md)
