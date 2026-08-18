# 01 - Mantine foundation and public submission form

**What to build:** Establish WildTrack's Mantine-based light theme and migrate the complete public submission experience without changing its approved academic or identity rules. The route must include the temporary wide form banner, a student-facing submission-success banner, the existing one-page form behavior, and honest loading, validation, unavailable, submitted, updated, and unchanged states.

**Blocked by:** None - can start immediately.

**Status:** complete

- [x] Mantine is installed and configured through one application-level provider using the approved WildTrack maroon, gold, warm-neutral, typography, radius, spacing, and component defaults.
- [x] Phosphor remains the only general interface icon library.
- [x] The public form opens directly without a separate WildTrack registration page, password prompt, OTP prompt, or artificial stepper.
- [x] First-time and returning identity UI states consume workspace-scoped account data without exposing another account's existing response. Real Google Identity Services token validation remains backend-owned and is explicitly outside the visual-rebrand scope.
- [x] The bundled temporary form banner renders responsively above the form content and remains the safe artwork fallback.
- [x] Received, updated, unchanged, unavailable, loading, workspace-error, and validation-error states are visually complete and use the temporary success artwork only where appropriate.
- [x] Due date, instructions, class-record identity, required fields, deliverable-specific link requirements, and submission action remain clear on desktop and mobile.
- [x] A frontend unit/component test harness covers the important public-form states through visible user behavior and response-ownership helpers.
- [x] Browser verification confirms no unintended horizontal scrolling at 1440x900 and 390x844 viewports.

Implementation note: account-owned responses are matched by provider subject when present and fall back to the current local account email only for the existing development session model. A conflicting account creates a separate preserved response and does not replace the canonical tracker source. Production ownership still requires backend-validated Google `sub` values, as defined in the identity design.
