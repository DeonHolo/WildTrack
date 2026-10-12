# Drive permission retirement — 13 October 2026

The owner only needs changes observed after a PDF is submitted. WildTrack's Document Check and configured Drive monitor already record those observations. Delegated Google revision-history access is retired; ordinary Google sign-in remains.

PR #102 removed the automatic permission popup and Google's revisions section from File History, but deliberately retained existing-grant account controls and dormant login/server code. The owner subsequently reported the remaining account menu and requested a complete audit and cleanup.

## Runtime cleanup

| Area | Change |
| --- | --- |
| Staff and student headers | Remove the Drive-history account menu and its status request. |
| Sign-in | Remove combined identity/Drive consent, permission callback messages and cancellation controls. Keep Google's ordinary identity credential exchange. |
| Session and routing | Use identity-only sign-in and workspace access. Remove Drive flags, permission events and gate dependencies; retain initial-session loading, role boundaries, safe return destinations and cross-tab refresh protection. |
| Client API | Remove delegated history, consent status/start/disconnect and combined-login redirect helpers. |
| Server | Remove delegated OAuth grants/gateways/controllers, Google revisions aggregation, combined-login controllers and required-permission filtering. |
| Configuration | Remove all `wildtrack.drive-history` YAML bindings. Old `WILDTRACK_DRIVE_HISTORY_*` variables no longer enable anything. |
| Notices and tests | Remove the obsolete account-disconnect instructions and retired feature expectations. Verify ordinary sign-in, private authorization, clean headers and recorded check history. |

These changes preserve the API-key Drive gateway, configured PDF monitoring, Document Check, saved observations, observed metadata and change labels. `RegisteredDriveStudentResolver` remains because recorded file-check history uses it independently of OAuth grants. AI Review is unchanged; this cleanup does not establish a successful live STD review.

## Historical data and settings

Applied migrations V26 and V35 remain unchanged so deployed Flyway history stays valid. Existing database rows are retained; this change does not revoke Google grants, delete encrypted historical connection records, or alter academic submissions. Deleted runtime code cannot read or refresh those grants.

Google Branding, verified domain ownership, public pages, hosting and ordinary identity configuration remain useful. The old restricted-scope review preparation is historical and is not needed for recorded PDF checks.

The following external settings are obsolete after this release; their deletion has **not** been performed as part of the code cleanup:

- Heroku variables: `WILDTRACK_DRIVE_HISTORY_OAUTH_ENABLED`, `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN`, `WILDTRACK_DRIVE_HISTORY_CLIENT_ID`, `WILDTRACK_DRIVE_HISTORY_CLIENT_SECRET`, `WILDTRACK_DRIVE_HISTORY_REDIRECT_URI`, `WILDTRACK_DRIVE_HISTORY_RETURN_ORIGIN`, `WILDTRACK_DRIVE_HISTORY_ENCRYPTION_KEY_BASE64`, and `WILDTRACK_DRIVE_HISTORY_SECURE_COOKIE`.
- Google Auth Platform Data Access: the separate `https://www.googleapis.com/auth/drive.metadata.readonly` declaration and its review preparation.
- The retired `/api/drive-history/auth/callback` redirect entry, if present on the Web OAuth client.
- Any previously granted Drive access under an individual user's Google Account connections. Removing app code does not revoke a grant at Google.

Keep the existing OAuth Web client and ordinary sign-in configuration, including `WILDTRACK_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` and authorized JavaScript origins. Keep `CAPVAULT_GOOGLE_DRIVE_ENABLED` and `CAPVAULT_GOOGLE_DRIVE_API_KEY` for submitted-file checks/monitoring. Database, Gemini, CORS and hosting settings are outside this retirement.

## Verification and release status

Local verification passed **671 frontend unit/component tests**, **44 browser checks**, **57 targeted backend tests**, the frontend build and backend packaging from a clean target. The packaged server contains no retired classes. Browser regressions cover student/admin/adviser headers, ordinary credential sign-in, recorded history, public pages and cross-tab refresh. Runtime source/configuration and the built frontend bundle contain no delegated Drive-history feature references.

The review also found an inherited return-path edge case: URL normalization could turn `/x/..//example.test` into a leading `//` destination. The generic sign-in helper now rejects that normalized destination, with regressions for raw and encoded dot segments. The production security fixture mocks Google identity verification so invalid-credential checks are independent of local provider configuration.

This record describes the proposed release, not a production deployment receipt. Record the pull request, hosted checks and deployment evidence here when available. The browser and backend tests use controlled identity/provider fixtures. Provider consent/revocation, a changed live PDF and a successful Gemini STD result have not been tested by this cleanup.

See the [external setup record](EXTERNAL_SERVICES_SETUP_2026-10-12.md) for the owner's original Google Cloud, Name.com, Heroku and Vercel work.
