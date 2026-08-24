# WildTrack

WildTrack manages capstone class workflows: academic workspaces, Google Sheet imports, deliverable forms, student submissions, progress tracking, adviser review, Document Check, and archive preparation.

> [!IMPORTANT]
> WildTrack is currently for local development and supervised demonstrations. It is **not ready for a public production deployment** or real student data. Read [Production status](#production-status) before exposing it to the internet.

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
git clone <repository-url> WildTrack
cd WildTrack
git switch main
```

Replace `<repository-url>` with the HTTPS clone URL shown on the repository's GitHub page.

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
2. Connect the Team Formation, Tracker, and Software Project Monitoring Google Sheets.
3. Import each Sheet and review its validation summary.
4. Generate suggested forms when Tracker deadlines are detected.
5. Open **Forms**, publish a deliverable, and copy its public form link.
6. Submit a Google Drive PDF link through the form.
7. Check the result in **Tracker**, **Review**, **Team Review**, and **Student Dashboard**.
8. Upload an official template in **Workspace**, then run **Check file** from a review screen.

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

Public Google Sheets can be imported without service-account credentials. Writing to a private Google Sheet requires Google Sheets API service-account credentials and permission to that Sheet.

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

### Student Numbers do not appear

1. Import the Team Formation Sheet in **Workspace**.
2. Confirm that the summary found the expected Student Number column.
3. Select **Refresh backend data**.
4. Reload the registration, student, or submission page.

### Google Sheet import fails

- Confirm that the Sheet is public or published.
- Paste the normal Google Sheets URL or published URL into the matching source field.
- Import Team Formation, Tracker, and Software Project Monitoring separately.
- Check the backend error log for the exact validation or network error.

### Document Check reports “Not checked” or cannot open a PDF

- Confirm that `setup-local.ps1` completed successfully.
- Confirm that the URL points to a Google Drive file, not a folder.
- Share the PDF as **Anyone with the link — Viewer**.
- Allow viewers to download the file.
- Confirm that it is a readable, non-password-protected PDF no larger than 25 MB.

## Production status

WildTrack is suitable for local development and a controlled classroom demo. Do not expose the current application publicly with real student information.

Production deployment still needs:

- authenticated, server-enforced Admin, Adviser, and Student authorization for every protected API;
- a reviewed production configuration and deployment manifest;
- a managed PostgreSQL database with migrations tested in the hosted environment;
- secrets management, backups, recovery procedures, monitoring, and alerts;
- rate limiting, abuse protection, and a security review;
- reliable background processing for long-running work;
- independent archive file storage and integrity verification;
- an end-to-end test using the final Google OAuth origins.

Google Sheet writeback, independent archive storage, and Gemini-assisted review also require separate service credentials and operational limits. Choose hosting only after the classroom demo scope is confirmed.

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
