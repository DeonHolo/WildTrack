# Required Google Drive history during sign-in — 12 October 2026

## Request and diagnosis

The owner requested that read-only Google Drive file-history permission become a condition of completing WildTrack login. A user may decline Google's consent; declined permission must not silently complete access to the application. This replaces the dismissible post-login prompt when required mode is enabled.

The supplied Google error states that the app is in Testing and only developer-approved testers can authorize it. This is a Google audience restriction, separate from the WildTrack callback, sharing permissions, and PDF size. Identity-only Google sign-in has a Testing exception; adding the Drive scope removes that exception.

## Test with an ordinary account

The owner explicitly wants Ron to test through the ordinary login flow, without adding him to a developer-only exception list. No test-user or Google Console configuration changes are authorized by this implementation task.

While Google's OAuth audience remains **Testing**, an unlisted account is blocked before WildTrack can finish authorization. Combining the login request cannot bypass that audience restriction. For the intended production audience, finish the applicable publishing, branding, and Drive data-access verification; then test Ron using the same **Continue with Google** button as everyone else.

Testing allows at most 100 listed users. Drive authorizations and offline refresh tokens in Testing expire after seven days. This is suitable for a limited test, not a permanent login prerequisite for the whole class.

## Application behavior

- One **Continue with Google** action starts an anonymous Google OAuth authorization-code request containing `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/drive.metadata.readonly`.
- The request uses state, PKCE, a protected browser callback cookie, and a nonce. Full verified Google identity and usable Drive permission must be saved before issuing the application session.
- There is no separate WildTrack consent card, onboarding step, or optional skip in required mode. Google presents and controls its own authorization screen.
- Denied, blocked, missing-scope, expired, and failed attempts return to the existing login page with an inline error. Retry always starts from an explicit click.
- Server checks also protect direct API calls and existing sessions that lose Drive permission. Private pages and cached workspace data remain hidden until login is complete.
- Sign-out and disconnect remain available. A disconnected account returns to the same ordinary login flow.
- Public form and workspace destinations survive the callback; malformed or external destinations are rejected.
- `WILDTRACK_DRIVE_HISTORY_REQUIRED_FOR_LOGIN` is an explicit rollout switch, initially `false` while the Google audience is not ready. Enabling it with unavailable OAuth configuration fails closed.
- The existing optional connection flow remains compatible while the rollout switch is off.

The app uses metadata for submitted PDFs. Permission does not modify Drive files, guarantee a complete revision history, or make a viewer eligible to read revisions Google restricts to owners/editors.

## Production rollout prerequisite

The linked brand-verification exception applies to actual development/testing/staging projects. It does not remove Testing's user list, user limit, or expiring grants. For a wider production audience, prepare a separate production project and the applicable branding and restricted-scope verification. Google lists `drive.metadata.readonly` as a restricted scope; publishing the app alone does not establish approval for that scope.

Do not turn on a mandatory login requirement for the live cohort until an eligible submitter successfully completes Google's authorization and the intended audience can authorize the app. Google configuration and successful live OAuth remain separate from local test results.

## Verification record

Implementation is complete locally. Initial verification passed all 680 frontend tests in 60 files, the production build, and 52 focused backend tests across 14 classes. Backend review found no blocking issue. The tests cover the combined anonymous callback, scope and token validation, callback replay, grant-before-session ordering, permission loss, safe destinations, private-route/cache isolation, and optional-mode compatibility. Migration `V35__google_drive_login_states.sql` stores the separate short-lived login state.

The first GitHub browser run exposed a public-form hydration regression: the global gate waited for identity before revealing public metadata. The corrected loader preserves immediate form display while response fields and private routes wait for verified identity. All 19 final gate regression tests and 35 local Playwright fixture tests passed, including delayed desktop/mobile hydration and signed-out field isolation. These browser fixtures do not prove live Google authorization.

The embedded HTTP CSRF regression required the Windows Java socket workaround `-Djava.net.preferIPv4Stack=true -Djdk.net.unixdomain.tmpdir=C:/Windows/Temp`; it passed with that setting. Provider authorization is not proven by these local tests. No Google consent, configuration write, live Gemini review, or deployment was performed for this request. The STD DOCX, PDF, and evidence ZIP remain frozen; this Markdown file is the change record.

## Primary references

- [Google brand-verification exceptions for development, testing, and staging](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification#projects-used-in-dev-test-stage)
- [Google app audience, test users, and token expiry](https://support.google.com/cloud/answer/15549945)
- [Google OAuth policies, requested scopes, and declined consent](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google Drive scope classifications](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
