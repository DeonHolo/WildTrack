# Drive history setup - 11 October 2026

> 12 October follow-up: Google blocked the submitter because the OAuth project was in Testing without that account on its test-user list. Required Drive consent is being integrated into sign-in behind an explicit rollout switch. See [Required Drive login](REQUIRED_DRIVE_LOGIN_2026-10-12.md) for the audience fix, access behavior, and production prerequisite. The live observations below are dated 11 October, not a successful current Google grant.

The current user OAuth flow requests four scopes. OAuth is the authorization mechanism, not an additional scope. The Google Cloud `drive` filter hides the identity scopes.

| Google Auth Platform Data Access scope | Purpose |
| --- | --- |
| `openid` | Verify the Google account identity. |
| `https://www.googleapis.com/auth/userinfo.email` | Identify its email address. |
| `https://www.googleapis.com/auth/userinfo.profile` | Obtain basic account profile details. |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | Read file and retained revision metadata. |

The backend requests `openid email profile` plus the metadata scope in `DriveOAuthConsentService`. The short email/profile names are the OpenID equivalents of the full userinfo scope URLs displayed in the console. On Data Access, clear the drive filter, retain the metadata checkbox, select the three identity rows, click Update, then Save.

These are the current app's user-consent scopes. The optional Sheets writeback integration separately uses `SheetsScopes.SPREADSHEETS` through a backend service account in `GoogleSheetsApiGateway`; it does not use the user's OAuth grant or require adding Sheets to this consent screen. Google sign-in uses Google Identity Services. Public Document Check uses the existing Drive API credentials and public file retrieval; AI Review uses the configured Gemini credentials. No full Drive, Drive file, Docs, Gmail or Calendar scope is requested by the current user OAuth code.

## Get the OAuth client secret

1. Open Google Cloud Console and select the existing **WildTrack Development** project (`capvault-503701`).
2. Open **Google Auth Platform > Clients**. Alternatively, **APIs & Services > Credentials > OAuth 2.0 Client IDs** leads to the client configuration.
3. Open the **Web application** client whose Client ID matches Heroku's existing `WILDTRACK_GOOGLE_CLIENT_ID`. The Drive-history client ID falls back to this variable. Do not replace the working sign-in client.
4. Find **Client secrets**. If you previously saved the original downloaded JSON, its `client_secret` value is usable. Google now shows an existing secret only in truncated form; the displayed last characters are not the complete secret.
5. If the full original was not saved, use **Add secret** on the same client. Copy/download the full newly generated secret immediately. Keep existing secrets enabled until their other consumers are identified; if two secrets already exist, do not delete one blindly.
6. In Heroku, open the `wildtrack` app, **Settings > Reveal Config Vars**, and add `WILDTRACK_DRIVE_HISTORY_CLIENT_SECRET` with the complete client secret as its value. Paste the value only, not the JSON document or quotation marks.
7. On that same Google client, add this exact **Authorized redirect URI**, retaining the existing entries:

```text
https://www.wildtrack.dev/api/drive-history/auth/callback
```

The callback belongs under Authorized redirect URIs, not JavaScript origins. Save it. Its scheme, host, path and trailing-slash behavior must match the Heroku setting exactly.

## Set the encryption key

This is a WildTrack server encryption key, not something supplied by Google Drive. It protects saved Google refresh tokens.

The live configuration is now recognized. Use the prepared key only for initial setup if no key is set yet; do not overwrite an existing valid key merely to repeat these instructions.

1. Open the prepared local file `.scratch/ui-followup-20261011/drive-history-encryption-key.txt` in the canonical CapVaultV2 checkout.
2. Copy its single 44-character Base64 line, including the final `=`. The prepared key was validated as 32 decoded bytes. Its value is deliberately absent from this document and chat.
3. In Heroku Config Vars, add `WILDTRACK_DRIVE_HISTORY_ENCRYPTION_KEY_BASE64` and paste that line as the value.
4. Keep this key stable after accounts connect. Replacing it without a migration prevents decryption of existing refresh tokens.

The key file is ignored by Git. Neither secret should be committed or included in shared screenshots.

## Remaining setup and connection

The user's setup screenshot showed the OAuth enabled flag, secure-cookie flag, callback and return origin, but lacked the two secret variables above. This is a dated screenshot observation, not proof of the current Heroku state after subsequent manual changes.

Keep these values:

```text
WILDTRACK_DRIVE_HISTORY_OAUTH_ENABLED=true
WILDTRACK_DRIVE_HISTORY_SECURE_COOKIE=true
WILDTRACK_DRIVE_HISTORY_REDIRECT_URI=https://www.wildtrack.dev/api/drive-history/auth/callback
WILDTRACK_DRIVE_HISTORY_RETURN_ORIGIN=https://www.wildtrack.dev
```

If **Audience** is **Testing**, the connecting account must be in Test users. Drive grants and refresh tokens in Testing expire after seven days. Production publishing and scope verification are separate requirements; selecting Production does not itself verify the restricted metadata scope.

After saving the settings, reload live WildTrack. `NOT_CONFIGURED` is a server setup state; `NOT_CONNECTED` means the applicable submitter has no usable consent grant. The submitter who owns or can access the file's revisions can open their submission's **File history** in the student view and use **Connect Drive edit history**. The administrator review view does not show that student connection button. Ordinary Google sign-in alone does not grant Drive history permission.

There is also an account-wide **Allow file history from Google Drive?** prompt with **Allow Drive history**. It was verified live for the signed-in administrator after configuration became available. Any authenticated account can see this optional prompt; allowing it does not automatically make a staff account an eligible submitter. Shared history uses grants belonging to active, identity-linked submitters of the exact same file. The connecting submitter must also have Google's permission to view that file's revisions.

Metadata scope permits read-only metadata access; it does not grant file-content downloads or allow editing Drive files. Google revision coverage can omit old edits. WildTrack's own observations remain separate snapshots from its Document Checks.

Live verification after the user's manual configuration changes: the refreshed STD File history now says **Drive edit history unavailable** and **No eligible submitter of this exact PDF currently has usable Drive history access**. The earlier setup warning is absent. This proves that the backend recognizes the required configuration; it does not yet prove a successful Google code exchange or revision grant. Genuine submitter consent remains to be tested.

## Sources

- Google OAuth client secrets and rotation: https://support.google.com/cloud/answer/15549257
- Google Auth Platform Data Access: https://support.google.com/cloud/answer/15549135
- Audience and Testing token lifetime: https://support.google.com/cloud/answer/15549945
- Drive scope definitions: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- OpenID Connect scopes: https://developers.google.com/identity/openid-connect/openid-connect
- Sheets scope definitions: https://developers.google.com/workspace/sheets/api/scopes

No STD DOCX, PDF or ZIP was edited. No new Gemini request was made for this setup audit.
