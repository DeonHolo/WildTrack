# Google branding setup — 12 October 2026

The supplied Audience screenshot explicitly disables Publish app until Branding is complete. The app name, support email and developer contact are filled, while the homepage, privacy-policy and terms links are empty. The live backend connection is already configured; Google audience/branding readiness is a separate prerequisite.

PR #98 merged as `6c6448f5` and deployed successfully to Heroku and Vercel. Live liveness/readiness returned `UP`; an anonymous session returned `driveHistoryConfigured: true` and `driveHistoryRequired: false`. No Google audience or hosted config-variable change was made.

## Public pages prepared for owner review

| Google Branding field | Value after these pages are deployed |
| --- | --- |
| Application home page | `https://www.wildtrack.dev/about` |
| Application privacy policy link | `https://www.wildtrack.dev/privacy` |
| Application terms of service link | `https://www.wildtrack.dev/terms` |
| Authorized domain | `wildtrack.dev` |

The homepage explains the academic workspace, PDF checks, configured Gemini review and read-only file history. The privacy notice describes identity and academic records, Drive owner/editor metadata, shared same-file history, PDF content sent to Gemini, service providers, storage, operational records and deletion requests. Terms describe authorized academic use and the limits of automated checks/history. The contact email matches the supplied Google Branding configuration.

All three routes are public while sign-in is loading, unavailable or missing Drive permission. They introduce no consent or acceptance step. The login page links to them; optional Drive prompts do not appear on these information pages. Private routes retain their existing permission checks. Coursework DOCX/PDF/ZIP artifacts remain frozen.

## Console steps after deployment

1. Open the Google Cloud project that owns the existing WildTrack OAuth client.
2. In Google Auth Platform → Branding, enter the three URLs above and save. Keep `WildTrack` as the app name and use the monitored support/developer contact shown in the supplied configuration. A logo is optional.
3. For verification, prove ownership of `wildtrack.dev` through Google Search Console. Use the project owner/editor Google account and add the TXT record supplied by Search Console with the domain's DNS provider.
4. Complete any Branding verification or View issues items Google presents. Publish branding when it is ready. Return to Audience and select Publish app; confirm the audience remains External and the publishing status is In production.
5. In Data Access, declare the identity scopes (`openid`, `userinfo.email`, `userinfo.profile`) and `https://www.googleapis.com/auth/drive.metadata.readonly`. Track the separate scope review in Verification Center for a production rollout.
6. Once the intended Google audience can authorize the app, enable `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN=true` in Heroku's Config Vars to activate the combined sign-in. This applies to the whole app. Use the ordinary Continue with Google action to test; do not add a special tester exception.

Publishing an External app removes the tester-only restriction. It does not complete scope verification: unverified sensitive/restricted access can show a warning and is capped at 100 users over the project's lifetime. The intended 303-student cohort requires appropriate verification before mandatory class-wide rollout. `drive.metadata.readonly` is restricted; Google may require a server security assessment unless an applicable exception is established. Website changes alone do not establish Google approval or successful live OAuth.

## Validation

All 691 frontend unit/component tests, 37 local Playwright fixture tests and the production build passed. Browser checks cover the information pages at desktop/mobile widths while identity resolution is delayed; route checks also cover pending permission and unavailable sign-in. These results do not establish Google verification, publishing or successful live OAuth.

## Primary sources

- [Google OAuth branding and public-page requirements](https://support.google.com/cloud/answer/15549049)
- [Audience, publishing and user limits](https://support.google.com/cloud/answer/15549945)
- [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
