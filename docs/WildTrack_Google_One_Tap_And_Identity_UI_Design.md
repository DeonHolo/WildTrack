# WildTrack Google One Tap and Identity UI Design

## Status

Approved on August 23, 2026.

## Goal

Make student access feel nearly invisible for people who already use Google in their browser while preserving an explicit, dependable sign-in fallback. The access UI must look like part of WildTrack rather than a third-party widget dropped into the form.

## Locked Behavior

- Public submission forms and the Student Dashboard offer Google One Tap when no verified WildTrack student identity is active.
- Eligible returning users may be signed in automatically by Google Identity Services.
- Automatic sign-in is best-effort. Browser privacy settings, multiple Google sessions, missing prior consent, dismissal cooldowns, and FedCM may still require one user confirmation.
- A standard `Continue with Google` button remains available whenever automatic sign-in does not complete.
- WildTrack never reads another tab or silently discovers a Google email on its own. It trusts only the signed Google ID token verified by the backend.
- An explicit WildTrack logout disables Google auto-selection so the user is not immediately signed back in.
- After Google verification, the existing editable Student Number, Student Name, Team Code, and submission fields appear.
- Google identity and selected class-record identity remain separate audit facts.
- Existing response links remain private to their owning Google subject.

## Interface Design

### Public Form

The form artwork, deliverable title, instructions, and deadline remain visible before sign-in. The response fields are replaced by one compact `Identity confirmation` section that uses WildTrack's existing typography, cream surface, maroon accent, gold detail, border radius, and spacing scale. It contains:

- a short label and title;
- one sentence explaining why Google is used;
- a reserved area for the official Google button;
- quiet loading text while Google Identity Services initializes or verifies the credential;
- an inline recovery message if Google is unavailable or verification fails.

The section does not imitate Google's button, create a separate password, or use a large generic warning card.

### Student Access Page

`/login` uses the same public WildTrack header, background, content width, and surface language as the submission form. It is a focused student-access screen, not a marketing page. One primary Google action is shown, with a compact explanation that no WildTrack password is created and Student Number selection happens after authentication.

### Student Dashboard

When signed out, the dashboard routes through the same student-access experience. When a browser still has a valid WildTrack identity, the dashboard opens normally without showing Google UI.

## Component Boundaries

- `GoogleSignInButton` owns loading Google Identity Services, initialization, the official fallback button, One Tap prompting, automatic selection, credential verification, prompt-status callbacks, and accessible progress/error output.
- Pages choose whether One Tap is enabled and provide an authenticated callback; they do not duplicate Google setup logic.
- `WorkflowContext` remains responsible for materializing the verified Google identity in the current local account model and disabling auto-selection on logout.
- Backend `POST /api/auth/google` remains the trust boundary for Google ID-token verification.

## Error Handling

- Missing client ID: explain that Google access is unavailable on this installation.
- GIS script failure: keep the fallback area present and provide a retry action.
- Dismissed or skipped One Tap: do not show an error; leave the standard Google button available.
- Invalid credential: show the backend verification error within the identity section.
- Explicit logout: suppress automatic re-entry and leave the user on a signed-out screen.

## Verification

- Unit tests cover initialization with auto-selection, One Tap prompting, successful verification, fallback rendering, script failure, and logout suppression.
- Public-form tests confirm response fields stay hidden before verification and appear afterward.
- Browser tests cover signed-out form and login layouts on desktop and mobile, no horizontal overflow, fallback visibility, and existing role flows.
- Backend tests continue to reject malformed or unverified Google credentials.

## Deferred Production Work

Google One Tap improves entry but does not replace durable authentication. A later production pass must issue secure backend sessions and persist accounts, submissions, response history, reviews, and identity connections in PostgreSQL.
