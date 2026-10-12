# WildTrack external service setup and operations record

**Recorded:** 12 October 2026  
**Coverage:** External configuration, owner actions, troubleshooting and releases discussed on 11–12 October 2026. Release times below use UTC.  
**Purpose:** Preserve the setup work performed outside the codebase for future deployment, maintenance and academic documentation.

**Current scope correction (12 October 2026):** The owner clarified that WildTrack only needs to track changes **after submission**. Ordinary Google sign-in and WildTrack's existing checks/monitoring cover that requirement. Google's separate revision history is optional and its restricted-scope review is **not a rollout prerequisite for this requirement**. Keep `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN=false`. Sections 2 and 8 retain the earlier setup and review preparation as history; section 9 records the current plan.


This record separates actions confirmed by the owner or screenshots, settings required by the application, and results checked on the live system. It does not reconstruct undocumented account creation, purchases or configuration changes. Credential values, database passwords, OAuth tokens and browser cookies are omitted.

## 1. Services and responsibility

| Service | Project, app or domain | Role |
| --- | --- | --- |
| GitHub | [DeonHolo/WildTrack](https://github.com/DeonHolo/WildTrack) | Source repository, checks, approved pull-request merges and deployment triggers. |
| Google Cloud / Google Auth Platform | WildTrack Development; project ID `capvault-503701` | Google identity, OAuth client, consent configuration and Drive metadata access. |
| Google Search Console | Domain property `wildtrack.dev` | Establishes domain ownership for Google verification. |
| Name.com | `wildtrack.dev` | Domain/DNS provider used for automatic ownership verification. |
| Heroku | `wildtrack` | Java backend, environment configuration and operational logs/metrics. |
| Vercel | `wild-track` | Frontend hosting and production custom domains. |
| PostgreSQL | Heroku configuration contained `DATABASE_URL` | Persistent application data; original provisioning and plan were not captured in this session. |
| Gemini | Backend `GEMINI_API_KEY` configuration | AI Review provider; original API-key creation, quotas and billing setup were not captured. |

Production browser addresses are [www.wildtrack.dev](https://www.wildtrack.dev/) and [wildtrack.dev](https://wildtrack.dev/). The Heroku app address is [wildtrack-e3a3dbd856d3.herokuapp.com](https://wildtrack-e3a3dbd856d3.herokuapp.com/). The frontend uses same-origin `/api` requests; successful public API checks demonstrate that production routing reaches the backend.

## 2. Google Cloud and Google Auth Platform

### Existing identity and Drive configuration

The owner worked in **WildTrack Development**, project **`capvault-503701`**, using the existing WildTrack OAuth client. Branding showed app name **WildTrack**, support email and developer contact **holodeon@gmail.com**.

An existing Google client ID and Drive API key appeared in Heroku Config Vars. Google Drive API appeared in the Data Access scope selector. The original dates of client creation, key creation and API enablement were not recorded.

For this implementation, the OAuth client must be a **Web application**. Its production authorized redirect URI must exactly match:

```text
https://www.wildtrack.dev/api/drive-history/auth/callback
```

The actual failed authorization request used this callback. The final full Clients-page inventory of authorized JavaScript origins and redirect URIs was not captured. When reviewing that page, check each served login origin, including `https://wildtrack.dev` and `https://www.wildtrack.dev`; origins contain no path, while a redirect URI includes the complete callback path.

### Scopes reviewed

| Scope | Purpose | Evidence and status |
| --- | --- | --- |
| `openid` | Identify the Google account through OpenID Connect. | Latest Data Access screenshot confirms it is declared. |
| `https://www.googleapis.com/auth/userinfo.email` | Obtain the account email used for identity and workspace association. | Declared in the latest screenshot and included in the captured OAuth request. |
| `https://www.googleapis.com/auth/userinfo.profile` | Obtain basic profile information. | Declared in the latest screenshot and included in the captured OAuth request. |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | Read metadata and available revision-history information for submitted Drive files. | Selected and saved in the supplied Data Access screenshots; included in the OAuth request. |

The OpenID Connect aliases `email` and `profile` correspond to the Google user-info scopes above. Broader Drive edit, delete or file-content scopes are not required for the metadata-history feature. The latest supplied Data Access screenshots confirm the complete four-scope list.

Google classifies `drive.metadata.readonly` as **restricted**. Branding approval and restricted-scope approval are separate stages. Google may require additional review or a security assessment depending on server handling and applicable exceptions. [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

### Initial access block and audience

The supplied Audience screenshot showed:

- **User type:** External.
- **Publishing status:** Testing.
- **Test users:** The owner's account was listed.
- **OAuth user count:** 1 of 100.

Attempting Drive authorization with the ordinary Ron account returned **`403 access_denied`**, stating that the app was being tested and could only be accessed by developer-approved testers. The owner explicitly chose **not to add Ron as a test user**, so that this account could test the ordinary-user experience.

The intended product behavior is one **Continue with Google** sign-in that includes the required Drive metadata permission, without a separate WildTrack “Allow file history?” / “Skip for now” decision. Google still displays its own consent and can reject or withhold the requested grant.

The combined login implementation is deployed but its mandatory mode remains disabled. The owner later clarified post-submission tracking as the actual requirement; mandatory Drive permission is no longer the intended rollout. Audience **In production** was not independently captured, and the subsequent Verification Center screenshot explicitly confirms that **Data Access is not verified**. This restricted-scope status affects the optional delegated-history feature, not the existing API-key PDF monitoring path.

For an External app, publishing removes the tester-only restriction. Unverified sensitive/restricted access can retain a warning and a lifetime 100-user cap; publishing alone is not scope verification. The app screenshots showed a 303-student cohort, so that cap does not cover the intended class-wide rollout. [Google audience and publishing rules](https://support.google.com/cloud/answer/15549945).

## 3. Domain ownership through Name.com

Google initially rejected Branding because the website at `https://www.wildtrack.dev/about` was not registered to the requesting account. The Google issue panel instructed the owner to verify ownership and wait 24 hours before retrying if necessary.

The owner completed these actions:

1. Opened Google Search Console.
2. Added or selected the **Domain property `wildtrack.dev`**.
3. Used Google's automatic domain-provider verification.
4. Signed into **Name.com** when prompted.
5. Confirmed the Search Console result **“You are a verified owner.”**

**The owner did not manually paste a DNS TXT record.** Signing into Name.com through the automatic verification flow was sufficient. The precise DNS changes made by that integration were not inspected; no verification token is reproduced here.

A read-only DNS lookup identified Name.com nameservers, consistent with the selected provider. A Search Console Domain property covers the domain's protocols and subdomains, including the `www` production address. Automatic provider verification is a supported alternative to manual DNS entry. [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080).

Use a Google account associated with the Cloud project as owner/editor for Google OAuth domain verification. The earlier 24-hour retry instruction was a troubleshooting step; the later successful ownership and Branding results are the current evidence.

## 4. Public pages and Branding verification

The original Branding screenshots had empty homepage, privacy-policy and terms fields, and Audience disabled **Publish app** until Branding was complete.

After the public pages were deployed through [PR #100](https://github.com/DeonHolo/WildTrack/pull/100), the owner entered:

| Google Branding field | Saved public URL |
| --- | --- |
| Application home page | [https://www.wildtrack.dev/about](https://www.wildtrack.dev/about) |
| Application privacy policy link | [https://www.wildtrack.dev/privacy](https://www.wildtrack.dev/privacy) |
| Application terms of service link | [https://www.wildtrack.dev/terms](https://www.wildtrack.dev/terms) |
| Authorized production domain | `wildtrack.dev` |

An older Vercel preview domain also appeared in Authorized domains. This session did not remove it or audit the complete domain list. A logo was not uploaded; it is optional.

The owner then supplied the completed Branding screen:

> Your branding has been verified and is being shown to users.

This confirms that Branding was verified and published. The three pages were also checked anonymously on the production site and returned HTTP 200. They are public while authentication is unavailable or loading.

The homepage explains WildTrack's academic purpose. The privacy notice covers account/academic information, Drive metadata and shared history for the same submitted file, configured Gemini processing, storage and contact/removal requests. Terms describe authorized academic use and the limits of automated checks. These deployed pages support the Console configuration; they do not themselves establish restricted-scope approval. [Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Branding requirements](https://support.google.com/cloud/answer/15549049).

The earlier [Google Branding setup record](old%20documents%2C%20templates/outputs/04-Software-Test-Document/GOOGLE_BRANDING_SETUP_2026-10-12.md) preserves the initial state. This document records the later ownership and Branding completion; its automatic Name.com verification account supersedes that earlier record's manual-TXT instruction.

## 5. Heroku configuration

### Hosting and connection

The owner inspected the **wildtrack** app's Settings, Metrics and Application Logs. The dashboard showed a GitHub connection to **DeonHolo/WildTrack**, branch **main**, and **one Basic web dyno with a 512 MB memory quota**.

The Config Vars screenshot exposed existing keys. This record stores their names and purposes only.

| Variable | Purpose / non-secret value | Evidence |
| --- | --- | --- |
| `CAPVAULT_CORS_ALLOWED_ORIGINS` | Allowed browser origins; production includes apex and `www` origins. | Present in screenshot; full value was truncated. Source production defaults include both. |
| `CAPVAULT_GOOGLE_DRIVE_ENABLED` | Enables the Drive gateway. | Screenshot value `true`. |
| `CAPVAULT_GOOGLE_DRIVE_API_KEY` | API key used by the configured Drive gateway. | Present; value omitted. |
| `DATABASE_URL` | Database connection URL and credentials. | Present; value omitted. |
| `GEMINI_API_KEY` | Server credential for Gemini AI Review. | Present; value omitted. |
| `WILDTRACK_GOOGLE_CLIENT_ID` | Existing Google identity client ID; default fallback for the Drive OAuth client ID. | Present; full identifier omitted. |
| `WILDTRACK_STAFF_BOOTSTRAP_ASSIGNMENTS` | Initial staff role assignments. | Present; assignment value omitted. |
| `WILDTRACK_DRIVE_HISTORY_OAUTH_ENABLED` | Enables delegated Drive OAuth. | Screenshot value `true`. |
| `WILDTRACK_DRIVE_HISTORY_SECURE_COOKIE` | HTTPS-only cookie configuration. | Screenshot value `true`; production also defaults to secure cookies. |
| `WILDTRACK_DRIVE_HISTORY_REDIRECT_URI` | `https://www.wildtrack.dev/api/drive-history/auth/callback`. | Screenshot prefix and actual Google request agree. |
| `WILDTRACK_DRIVE_HISTORY_RETURN_ORIGIN` | `https://www.wildtrack.dev`. | Shown in screenshot. |
| `WILDTRACK_DRIVE_HISTORY_CLIENT_SECRET` | Secret belonging to the Google Web application OAuth client. | Required by source; not visible in the initial screenshot. Later live readiness confirms a nonblank configured secret. |
| `WILDTRACK_DRIVE_HISTORY_ENCRYPTION_KEY_BASE64` | Base64 encoding of a 32-byte encryption key for stored delegated credentials. | Required by source; not visible initially. Later readiness confirms the key passes format/length validation. |
| `WILDTRACK_DRIVE_HISTORY_CLIENT_ID` | Optional explicit OAuth client override. | Source option; no evidence it was separately set. Falls back to `WILDTRACK_GOOGLE_CLIENT_ID`. |
| `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN` | Enables the combined, mandatory Drive-permission login for the whole app. | Default `false`; latest anonymous live response reports `driveHistoryRequired: false`. |

The OAuth **client secret** comes from **Google Auth Platform → Clients → the Web application client**. The **encryption key** is generated by the application administrator; it is not a Google Drive API credential. Both belong on the backend, not in frontend settings or this document.

The original “Drive history connection needs setup” message described backend configuration availability. Merely setting the enabled flag was insufficient: the backend also validates the client settings, callback, return origin, secure-cookie requirement and encryption-key format. Later live checks reported **`driveHistoryConfigured: true`**. That check validates local configuration shape; it does not prove Google accepts the client secret, issues a grant or returns revisions.

The Drive API-key gateway used for document retrieval/checking and delegated OAuth used for file-history metadata are separate connections. A working Document Check does not prove revision-history permission is connected.

No Heroku Config Vars were changed by the code-deployment operations recorded here. The exact manual entry times for later credentials were not captured.

### Memory incident and operational investigation

The owner opened Metrics and supplied screenshots showing **R14 — Memory quota exceeded**:

| Measurement | Supplied dashboard value |
| --- | --- |
| Dyno quota | 512 MB |
| Latest usage | 695.5 MB / 135.8% |
| Maximum usage | 776.6 MB / 151.7% |
| Average usage | 623.9 MB / 121.9% |
| Memory errors in selected period | 4,022 in the past 24 hours |

Application Logs also showed a process using approximately **693 MB / 135.5%**, followed by R14. These readings concern total process memory, which includes more than the Java heap. They do not identify a memory leak or explain a particular Gemini invalid response by themselves. [Heroku Java memory guidance](https://devcenter.heroku.com/articles/java-memory-issues).

[PR #98](https://github.com/DeonHolo/WildTrack/pull/98) deployed bounded runtime defaults and reduced template-related allocation. The checked-in startup defaults are:

- `MALLOC_ARENA_MAX=2`.
- `WILDTRACK_JAVA_MEMORY_OPTS` default: `-Xms64m -Xmx256m -Xss512k -XX:ReservedCodeCacheSize=64m`.
- HTTP threads: maximum 32, minimum spare 4.
- Database pool: maximum 6, minimum idle 1.

These are **application startup defaults**, not evidence that the owner manually added each as a Config Var. No dyno upgrade was recorded. A local 58-page STD check passed under the bounded heap, but sustained hosted memory usage and successful live STD AI Review remain unverified.

The supplied STD AI response was stuck at `RUNNING` / `reused: true`, and another batch reported an incomplete/invalid Gemini response. The browser message and R14 screenshots did not reveal the exact provider failure reason. Further diagnosis needs the relevant **“Gemini AI review”** log lines with secrets removed; no successful paid retry is claimed here.

## 6. Vercel hosting and release record

The frontend project is **wild-track**. Both production custom domains were checked after the latest release. The full original Vercel project creation, domain attachment and environment-variable setup were not captured.

Source expects `VITE_GOOGLE_CLIENT_ID` for the frontend Google identity button. Its exact deployed Vercel value was not inspected. OAuth client secrets, encryption keys, database passwords and Gemini keys are backend settings.

The owner approved merging and deploying PRs #96, #97, #98 and #100. PR #101 was delivered in response to the explicit request to fix the live sign-in loop.

| PR | Purpose | Merge time (UTC) | Merge commit |
| --- | --- | --- | --- |
| [#96](https://github.com/DeonHolo/WildTrack/pull/96) | Review continuity, recovered-PDF action handling, File History and template feedback. | 2026-10-11 14:28:32 | `233ec86099505c6bdf30e3789a2f59be65c5c993` |
| [#97](https://github.com/DeonHolo/WildTrack/pull/97) | Adviser artifact cards match Admin Review, without either rerun control. | 2026-10-11 15:04:28 | `c15da2da4dab9efd7fb85d8f31c906cce135a45d` |
| [#98](https://github.com/DeonHolo/WildTrack/pull/98) | Combined Google/Drive login behind a switch; memory and review-diagnostic improvements. | 2026-10-12 06:41:33 | `6c6448f5ec01eb49bb6a0b2e78da38703d19d4ed` |
| [#100](https://github.com/DeonHolo/WildTrack/pull/100) | Public homepage, privacy and terms for Google Branding. | 2026-10-12 07:25:35 | `f9a8f911e08023d69f1bc165465aa2ecb5e7493f` |
| [#101](https://github.com/DeonHolo/WildTrack/pull/101) | Stops app-wide “Checking Google sign-in” flickering caused by cross-tab session notification echoes. | 2026-10-12 11:43:05 | `ca21085391882e43ef159cb5ddf81ed3426c4112` |

Production deployment receipts were checked for the exact merged revisions of PRs #98, #100 and #101. The table records provider-reported success; a Preview success alone was not treated as production deployment.

| Release | Vercel production deployment | Heroku build / deployment |
| --- | --- | --- |
| #98 | [Production deployment](https://wild-track-6yq94q7kc-holodeon-gmailcoms-projects.vercel.app), ID `7008075092` | [Build receipt](https://dashboard.heroku.com/apps/wildtrack/activity/builds/2528b80c-290b-446d-82f5-fe9a8c2c593a), deployment `7008074287` |
| #100 | [Production deployment](https://wild-track-s5o6eos2i-holodeon-gmailcoms-projects.vercel.app), ID `7008713643` | [Build receipt](https://dashboard.heroku.com/apps/wildtrack/activity/builds/f3a32ebf-a76a-4acb-8dd1-7bd34a07112b), deployment `7008710756` |
| #101 | [Production deployment](https://wild-track-rmg7kc44a-holodeon-gmailcoms-projects.vercel.app), ID `7013213205` | [Build receipt](https://dashboard.heroku.com/apps/wildtrack/activity/builds/3c043d5c-a129-4aa7-ae65-6cfb2c8f3f22), deployment `7013210934` |

For #96/#97, merge metadata was rechecked; this document does not reconstruct separate deployment receipts.

After #101, both domains served the repaired frontend asset `/assets/index-BiSoTKIg.js`. The owner was instructed to hard-refresh every open WildTrack tab so old and new login code would not continue interacting. No Google account choice or Drive grant was submitted during the anonymous production smoke checks.

## 7. Verified state at the documentation checkpoint

| Item | Status on 12 October 2026 | Evidence limit |
| --- | --- | --- |
| Search Console domain ownership | **Complete** | Owner screenshot: verified owner of `wildtrack.dev`. |
| Branding verified and shown to users | **Complete** | Latest Google Branding screenshot. |
| Public homepage/privacy/terms | **Live** | Anonymous HTTP 200 on all three routes. |
| Backend liveness/readiness | **UP** | Anonymous `/api/health/live` and `/api/health/ready`. |
| Drive OAuth configuration shape | **Configured** | `/api/auth/session`: `driveHistoryConfigured: true`. Does not validate a real grant. |
| Required Drive login | **Disabled** | Same response: `driveHistoryRequired: false`. |
| Audience **In production** | **Not confirmed** | Latest supplied Audience screen still showed Testing; Branding success alone is insufficient evidence. |
| Restricted Drive scope approval | **Not verified** | Latest Verification Center screenshot explicitly says Data Access is not verified and review is required. |
| Ordinary, non-allowlisted account consent | **Not confirmed** | Earlier attempt was blocked; no subsequent successful grant captured. |
| Actual submitted-file revision retrieval | **Not confirmed** | No successful live revision response captured after this setup. |
| Sustained hosted memory improvement | **Not confirmed** | No post-change monitoring period recorded. |
| Latest STD live AI Review success | **Not confirmed** | Exact provider failure log and a successful follow-up were not supplied. |

An anonymous response also contained `authenticated: false` and `driveHistoryConnected: false`. That is expected for the anonymous probe and does not describe the signed-in owner's connection.

## 8. Historical preparation for optional Google Drive history — 12 October 2026

The next screenshots confirm that **all four scopes** are declared: `openid`, `userinfo.email`, `userinfo.profile`, and `drive.metadata.readonly`. Verification Center explicitly reports that **Data Access is not verified** and requires review. Branding remains verified and shown to users. The preparation form's feature selection, justification and demo-video information were still being completed; no review-submission confirmation was supplied.

For **What features will you use?**, the recommended selection is **Drive productivity**. This is an inference from WildTrack's academic submission, adviser review and classroom collaboration functions, which fit Google's productivity/education category. Backup and synchronization are not the implemented feature. Google's reviewers determine eligibility. [Permitted Drive application types](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

For **How will the scopes be used?**, the following explanation was prepared against the current metadata gateway and Drive-link submission workflow. It is **810 characters**, below the displayed 1,000-character limit. This is prepared text, not evidence of submission or approval.

```text
WildTrack is a college capstone submission and adviser-review workspace. We use drive.metadata.readonly to read metadata and available revisions of Drive files submitted by users: creation/modification times, owners, and available editor identities. Authorized reviewers use this information to assess submission history. The application requests only submitted file IDs; the scope itself grants broader metadata access. This scope is not used to download file contents or modify Drive files. Existing submissions are links to files not created or opened through WildTrack or Google Picker. drive.file would require per-file authorization that the current Drive-link submission workflow does not perform. Read-only metadata access supports this workflow without requesting broader Drive read/write permissions.
```

For the **demo video**, record the real grant and working feature in English:

1. Show the user initiating Google sign-in/authorization, the WildTrack app name, the OAuth client ID visible in the consent-page address, and the requested Drive metadata permission.
2. Grant access with an account that can authorize the demonstration environment. The owner's existing test access can be used; Ron does not need to be added to the test list.
3. Open a submitted Drive file in WildTrack's File History and show actual **Google Drive edits/revisions** and available owner/editor/timestamp metadata.
4. Explain that WildTrack's recorded Document Checks are separate app inspection snapshots. A blank result, setup error or recorded-check list alone does not demonstrate the Google metadata feature.
5. Upload the recording to YouTube as **Unlisted**, enter its link in the form, complete the remaining fields, and follow Verification Center's submission steps.

For an already public app, the supplied Console guidance recommends recording new-scope behavior in staging/internal testing or a separate test project. Do not enable mandatory Drive login for all production users just to record the demo. A demonstration of the intended combined login requires that mode in the demonstration environment; existing optional connection footage alone does not show the final combined sign-in experience. [Google verification video requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

WildTrack's backend processes restricted metadata, so Google's server-side security-assessment requirement must be addressed unless Google confirms an applicable exception. The justification and video are preparation for review, not a guarantee of scope approval.

## 9. Current plan: track changes after submission

1. Keep ordinary Google identity sign-in, the verified domain/Branding, public information pages, hosting and the existing PDF/AI integrations.
2. Keep `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN=false`. Stop the additional restricted-scope verification work for the current requirement; no demo-video or assessment submission is needed to use the existing PDF monitor.
3. Remove the automatic post-sign-in Drive-history permission popup. This cleanup is prepared in the code; it was not yet deployed at the anonymous live checkpoint above. Optional explicitly opened history tools and their backend configuration are retained.
4. Retain the existing submission check. `FormResponseService` schedules Document Check after the submission transaction commits, for configured checkable PDF fields whose links were newly submitted or changed. Provider failure does not roll back the academic submission.
5. Treat the first **successful** recorded check as the verified comparison baseline. If the PDF is inaccessible or its check fails, no original-content identity should be invented. The monitor can seed from a real earlier check of that same field/URL; a first observation alone cannot reconstruct the contents at the original submission time.
6. Use the existing per-workspace file monitor for later comparisons and changed-file alerts. It uses the API-key Drive gateway and current file checks, independently of delegated Google history consent. Automatic monitoring is enabled by an administrator in Workspace settings.
7. Validate submission → initial successful check → later changed PDF → recorded change/alert through the real request path. Checks occur when the monitor runs; this is not continuous capture of every intermediate edit. Actual hosted timing and recovery need live evidence.
8. Continue the separate STD AI Review diagnosis using provider logs. Removing the history popup does not establish that the prior AI provider failure is resolved.

The extra Google Data Access form in section 8 is preserved as an optional feature proposal, not an instruction to continue verification or turn on mandatory Drive login.


## 10. Evidence and source pointers

Conversation evidence is identified by attachment basename, not temporary local paths. Original screenshots remain conversation attachments; raw credential/cookie screenshots are deliberately not copied into the repository.

| Evidence | Attachment or observation |
| --- | --- |
| Initial Heroku Config Vars | `codex-clipboard-2265e315-574c-4b35-a288-12a95b9070dd.png`; secret values omitted here. |
| Data Access scope selection | `codex-clipboard-dba63a71-5d09-4e62-a1cd-aad2bee7c7da.png` and `codex-clipboard-a8650cb6-b53f-4912-ab1e-6f399b8602f3.png`. |
| Blocked ordinary-account authorization | `codex-clipboard-41e093ee-7550-4e7f-8067-d89fba9a2657.png` and `codex-clipboard-1c8784a5-6a93-4061-b46f-1a1cc3d085a5.png`. |
| Initial incomplete Branding / Testing audience | `codex-clipboard-ea78f950-a06c-4aa6-a800-3f560aaa22c9.png`, `codex-clipboard-d1a56ca2-a7f6-450e-83cc-beb2eec1af29.png`, `codex-clipboard-f9fc8927-0256-4d4d-8980-d411658b8dee.png`. |
| Ownership rejection | `codex-clipboard-67a9d211-bc94-472d-9020-6965c15b27ae.png`. |
| Name.com automatic verification and success | Owner's explicit confirmation plus `codex-clipboard-30907400-9539-4344-8b24-67f8993c1ed2.png`. |
| Branding success | `codex-clipboard-b1914116-a72b-49d1-a348-0d4fd9e1f337.png`. |
| Latest declared scopes and unverified Data Access | `codex-clipboard-ced3e34a-b399-42e9-8d7e-5b79d6d636d6.png`, `codex-clipboard-77ee64b8-9ee9-4069-af4f-da8f9b919b91.png`, `codex-clipboard-f981ae49-a920-4077-9e6b-4a6bb50545f3.png`, `codex-clipboard-1ca55205-ecdc-43ee-bee5-cae12337efe3.png`. |
| Heroku memory metrics/logs | `codex-clipboard-f243712e-ce42-47a5-9081-5dc5af4a7783.png` and `codex-clipboard-ece3e3c5-668c-4432-8425-93c5a08ae324.png`. |
| Releases and live state | GitHub merge/deployment metadata and anonymous production checks recorded above. |

Source bindings for future maintenance:

- [Backend environment-variable bindings](../backend/src/main/resources/application.yml).
- [Production defaults](../backend/src/main/resources/application-production.yml).
- [Drive OAuth configuration validation](../backend/src/main/java/com/capvault/backend/drivehistory/auth/DriveOAuthProperties.java).
- [Heroku startup command](../Procfile).
- [Frontend Google client configuration](../frontend/src/components/auth/GoogleSignInButton.jsx).
- [Same-origin API calls](../frontend/src/lib/api.js).

**Not reconstructed:** initial domain purchase/DNS records, database provisioning/backup policy, Vercel environment history, API-key restriction/rotation history, Google Sheets service-account setup, billing or quota changes, and scope-verification approval not shown in this conversation. These should be documented from their actual provider records when available.

