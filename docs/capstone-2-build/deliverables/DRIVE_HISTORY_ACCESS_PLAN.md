# Optional Google Drive revision-history access plan

**Status:** prepared locally for Ticket 09. No new Google consent has been requested, no OAuth credentials have been created, and no live Drive history has been read.

## Decision

WildTrack should keep its current pasted Google Drive link flow and current API-key based Document Check path. Older revision history, if enabled later, should be a separate optional **Connect Drive history** capability using delegated OAuth.

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

Because this is a materially broader consent surface than Google Sign-In, implementation must remain gated behind explicit owner approval. Ordinary WildTrack submission and Document Check must continue to work when the user never connects Drive history or later revokes access.

## Proposed UX

1. Keep the existing pasted Drive link field unchanged.
2. In an authenticated student/account settings or response-history area, offer **Connect Drive history (optional)** with a short explanation that it reads available revision metadata for eligible files.
3. Start OAuth only after the user chooses Connect.
4. On success, show source-labeled entries as **Google Drive revision metadata** beside WildTrack-observed events.
5. If the user lacks editor-level access, the token is expired/revoked, history is incomplete, or the API omits editor email, show that limitation directly.
6. Provide **Disconnect Drive history**. Revoking this access must not break existing links, submissions, Document Check, or stored WildTrack response history.

## Backend integration shape

Keep this separate from `GoogleDriveApiGateway`, which is the API-key gateway used for current-file Document Check.

Suggested bounded interfaces:

- `DelegatedDriveHistoryGateway`
  - `listRevisions(googleSubject, DriveFileReference, pageToken)`
  - returns revision id, modified time, MIME type, optional size, keep-forever flag, and optional last-modifying-user metadata
- `DriveAuthorizationService`
  - begin authorization with state protection
  - exchange callback code
  - refresh short-lived access tokens
  - disconnect/revoke local authorization
- `DriveHistoryService`
  - verifies the signed-in WildTrack subject owns the stored authorization
  - requests revisions only for the submitted file currently being viewed
  - maps results to source-labeled history entries

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

These steps are preparation only. Do not perform them until the owner explicitly approves the additional Drive consent design.

1. In the Google Cloud project used by WildTrack, enable **Google Drive API**.
2. Configure the OAuth consent screen with the WildTrack app identity, authorized domains, privacy-policy/support details required by the project's publication state.
3. Add `https://www.googleapis.com/auth/drive.metadata.readonly` to the consent configuration.
4. Review Google's restricted-scope verification requirements before exposing this scope to external production users.
5. Create/use a Web OAuth client for the backend callback. Proposed callbacks:
   - local: `http://localhost:8080/api/drive-history/oauth/callback`
   - production: `https://wildtrack.dev/api/drive-history/oauth/callback`
6. Store client ID, client secret and token-encryption material only in local/deployment secrets, never in Git.
7. Keep current `CAPVAULT_GOOGLE_DRIVE_API_KEY` configuration unchanged for the existing Document Check gateway.
8. After implementation, test with separate files where the consenting user is Owner/Editor versus Viewer and record the difference.

## Local/mock acceptance path before any real consent

Implementation, if later authorized, can be developed first against a fake delegated gateway with these deterministic cases:

1. owner/writer gets two paginated revisions including modifying-user metadata;
2. writer gets revision metadata but user email is omitted;
3. viewer receives insufficient-permission behavior;
4. expired token refresh succeeds;
5. revoked/invalid refresh token disables only Drive history;
6. repeated page results are de-duplicated by source revision id;
7. older history is explicitly incomplete/purged;
8. a malicious request for another WildTrack account's token/file context is denied;
9. normal pasted-link submission works with no delegated authorization at all.

## Gate before implementation

Ticket 09 local preparation is complete when this plan is reviewed. The next acceptance criteria require the owner's explicit approval of this additional OAuth/restricted-scope design. Live verification additionally requires genuine Google consent and a file for which the consenting account has an eligible Drive role.
