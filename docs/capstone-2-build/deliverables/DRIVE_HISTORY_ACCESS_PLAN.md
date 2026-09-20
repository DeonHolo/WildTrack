# Google Drive revision-history access and shared-file consent

**Status:** owner authorized the additional delegated Drive metadata scope and the shared-file integration on 2026-09-19. Local implementation is in progress; focused mocked integration tests have passed, while later code changes require rerunning the final suites. Live Google consent, live revision retrieval, production OAuth readiness, and restricted-scope verification have not been established.

## Decision

WildTrack keeps the current pasted Google Drive link flow and API-key Document Check path. After Google Sign-In, it offers one additional, dismissible Google Drive metadata consent step using delegated OAuth. Granting access does not become a prerequisite for submitting a PDF. The owner explicitly rejected requiring an independent manual **Connect Drive history** setting and authorized the additional read-only metadata permission.

For the pasted-link requirement, the technically compatible scope is:

- `https://www.googleapis.com/auth/drive.metadata.readonly`

Reason: Google documents `drive.file` as per-file access for files the user opens with the app or shares with the app through a file picker. WildTrack explicitly does not require a picker and accepts already-pasted links, so `drive.file` cannot be assumed to authorize arbitrary pasted files. `drive.metadata.readonly` can read Drive metadata without file content, but Google classifies it as a **restricted** scope.

Do **not** request `drive.readonly` for this feature. Older-history display only needs revision metadata, not revision file contents. Document Check continues to use the existing API-key path for current file metadata/download where sharing allows it.

Official sources checked 2026-09-19:

- Google Drive API scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Manage file revisions: https://developers.google.com/workspace/drive/api/guides/manage-revisions
- Changes and revisions overview: https://developers.google.com/workspace/drive/api/guides/change-overview
- Configure OAuth consent: https://developers.google.com/workspace/guides/configure-oauth-consent
- Drive roles: https://developers.google.com/workspace/drive/api/guides/ref-roles

## What the API can and cannot prove

- Google states revision history access requires the requesting user to have Drive role `owner`, `organizer`, `fileOrganizer`, or `writer`. Viewer/commenter access is insufficient.
- `revisions.list` may return an incomplete history for files with many revisions. The Drive UI can show more than the API returns.
- Binary/PDF revisions can be purgeable. Older non-`keepForever` revisions are typically retained for about 30 days but may be purged earlier after many revisions.
- `lastModifyingUser.emailAddress` can be absent depending on what the requester is allowed to see. WildTrack must show `Modified by` only from returned metadata and never substitute the submitter as the editor.
- This capability therefore reports **authorized Drive revision metadata available to WildTrack**, not a guaranteed complete authorship/history record.

## Consent and verification impact

`drive.metadata.readonly` is a restricted Drive scope. A public WildTrack deployment using it can require Google's restricted-scope verification. If restricted-scope data is stored or transmitted by the server, Google documentation also warns that a security assessment can apply.

Do not claim that a selected scope plus an enabled Drive API immediately works for all 303 imported students. Google's External / Testing authorization has a hard limit of 100 test users; published-but-unverified applications requesting sensitive/restricted scopes also have a user cap. Verify audience, publishing status, OAuth verification, and institutional Internal-app eligibility before enrolling the whole cohort. Google can issue short-lived refresh tokens in Testing mode, so a single successful local consent does not prove stable long-term cohort access.

The owner explicitly approved local implementation on 2026-09-19. This is still a materially broader consent surface than Google Sign-In. Ordinary WildTrack submission and Document Check continue to work when the user declines or later revokes consent. Google OAuth production verification and real live file access are separate acceptance gates.

## Approved UX and same-file sharing

1. Keep the existing pasted Drive link field unchanged. Do not introduce a mandatory picker or an upload.
2. Keep Google Sign-In as identity-only. After login, offer a dismissible one-time request for read-only Drive metadata authorization. Do not silently treat an identity token as authorization for Drive. Students may skip and still submit normally.
3. The owner specifically requests that when an eligible owner/editor who submitted file **F** authorizes access, Google-provided metadata for **F** becomes available in the Document Check of *other WildTrack users who submitted that same file*. Normalize pasted URLs to Google Drive file IDs, never rely on exact URL-string equality. Do not use the grant for arbitrary file IDs or unrelated personal Drive files.
4. When one authorized submitter has eligible Drive permissions, make that file's history available on demand to the signed-in owner of another response containing the same file, or to staff authorized for that response. This does not confer the original Google account's credentials or permissions on another user; WildTrack only discloses scoped evidence from a server-side request after checking current local submission authorization. No global search/list of personal Drive files.
5. Show current shared metadata as a **fresh Google Drive observation** instead of rewriting prior Document Check snapshots. Keep **WildTrack observed history** and **Google Drive revision metadata** separate, source-labeled sections inside Document Check's File History tab. Paginate Drive revisions and state that older revisions may be omitted.
6. Show creation and modification times to submitters. Restrict Drive owner/editor names and emails to authorized staff/advisers, and disclose in the permission prompt that metadata of submitted files may be shared with other WildTrack submitters of that exact file.
7. If Google declines access, the subject lacks eligible Drive rights, history is incomplete, the token is expired/revoked, or Google omits editor identity, show the limitation instead of a fabricated result. Never treat revision-list timestamps as independent proof of same-link PDF content change or original authorship.
8. Include an authenticated **Disconnect** action. Stop using that subject's token for future shared requests on disconnect. The source-labeled WildTrack observations and ordinary PDF submissions remain unaffected. The implementation currently fetches Drive history on demand rather than retaining a global historical revision snapshot. Server-side pagination cursors are short-lived and in-memory; restarting the server invalidates them safely. A multi-replica deployment requires shared cursor storage or session affinity.

## Backend integration shape

Keep this separate from `GoogleDriveApiGateway`, which is the API-key gateway used for current-file Document Check.

The locally implemented split is:

- `DelegatedDriveAccessService` and OAuth controller:
  - start a signed, session-bound authorization-code flow with PKCE, validate callback state/session and a separately verified Google ID token, encrypt refresh tokens, refresh short-lived access tokens, disconnect/revoke
- `DelegatedDriveGateway`:
  - paginated `revisions(token, fileId, pageToken, pageSize)` and current-file metadata using Google Drive's read-only scope
- `SharedDriveHistoryService` and read endpoint:
  - verify own response or authorized Admin/adviser assignment, resolve the actual submitted PDF field, find active authorized subjects who submitted the identical Drive file ID, request only that file's metadata/revisions, redact owner/editor identity on student responses

The current lookup scans persisted responses when a File History request is made, matching normalized Drive file IDs and current active submitter associations. This is a bounded single-cohort MVP design, not a scalable index for arbitrary numbers of historical submissions. Future scale requires a transactionally maintained, indexed response/field-to-file-ID mapping, with reindexing on PDF link change and no sharing across unrelated IDs. The current lookup can consider exact-file submissions from separate workspaces, but only an independently authorized response owner or assigned staff member can request history for their target response.

Do not merge these Drive revisions with WildTrack-observed events into an unlabeled synthetic timeline. Preserve source and retrieval limitations.

## Token/data handling requirements

- Use the existing WildTrack Google subject as the local account key, not email.
- OAuth callback must validate `state`; use authorization-code flow suitable for the backend web application.
- Client secret and token-encryption key live only in deployment secrets/environment configuration.
- Persist only the minimum token data needed for refresh; encrypt refresh tokens at rest.
- Store granted scopes, connected/revoked timestamps and token subject/account binding for audit.
- Never write access or refresh tokens to application logs, browser local storage, EVIDENCE.md, screenshots or participant exports.
- On disconnect, delete or cryptographically retire the refresh token. Existing source-labeled revision snapshots may remain only if the product explicitly chooses that retention and labels them as previously observed data.

## Cloud/app setup checklist for the owner

The owner has approved this consent design and selected the scope. Google Cloud setup for real consent remains the owner's action. API enablement alone does not configure the OAuth consent screen or delegated token exchange.

1. In the Google Cloud project used by WildTrack, enable **Google Drive API**.
2. Configure the OAuth consent screen with the WildTrack app identity, authorized domains, privacy-policy/support details required by the project's publication state.
3. Add `https://www.googleapis.com/auth/drive.metadata.readonly` to the consent configuration.
4. Review Google's restricted-scope verification requirements before exposing this scope to external production users.
5. Create/use a Web OAuth client for the backend callback. Proposed callbacks:
   - local: `http://localhost:8080/api/drive-history/auth/callback`
   - production: `https://wildtrack.dev/api/drive-history/auth/callback`
6. Store client ID, client secret and token-encryption material only in local/deployment secrets, never in Git.
7. Keep current `CAPVAULT_GOOGLE_DRIVE_API_KEY` configuration unchanged for the existing Document Check gateway.
8. After implementation, test with separate files where the consenting user is Owner/Editor versus Viewer and record the difference.

## Local/mock acceptance path before any real consent

The owner has authorized implementation. Mocked tests cover the OAuth flow and scoped shared-file retrieval; the following remain the complete acceptance matrix before a live rollout:

1. owner/writer gets two paginated revisions including modifying-user metadata;
2. writer gets revision metadata but user email is omitted;
3. viewer receives insufficient-permission behavior;
4. expired token refresh succeeds;
5. revoked/invalid refresh token disables only Drive history;
6. paginated requests keep the same delegated grant, with short-lived opaque server cursors rather than Google page tokens in the browser; Google does not guarantee a complete historical revision list;
7. older history is explicitly incomplete/purged;
8. a malicious request for another WildTrack account's token/file context is denied;
9. normal pasted-link submission works with no delegated authorization at all.

## Remaining live gates

The additional scope and implementation are owner-authorized, but local tests cannot establish a real Google consent, production OAuth verification, or historical Drive permissions for any real file. An actual consenting account with an eligible Drive role must complete the flow before marking live verification complete. Restricted-scope verification and possible security-assessment obligations must be resolved before treating external production rollout as ready. Do not ask students to grant the new scope until those release requirements and the application's consent disclosures are ready.
