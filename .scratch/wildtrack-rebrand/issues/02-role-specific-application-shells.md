# 02 - Role-specific application shells

**What to build:** Replace the shared CapVault navigation with WildTrack shells tailored to Sir/Admin, advisers, students, and public forms. Preserve current route behavior and workspace context while making production navigation distinct from development-only role preview controls.

**Blocked by:** 01 - Mantine foundation and public submission form.

**Status:** completed

- [x] The product name and shared navigation surfaces display WildTrack rather than CapVault.
- [x] Sir/Admin receives a compact staff shell with institution-wide operations, persistent workspace context, and direct access to assigned teams without a production role switch.
- [x] Regular advisers receive only assigned-team review and permitted tracker navigation.
- [x] Students use a lightweight top navigation centered on dashboard and Google account actions.
- [x] Public forms remain distraction-free and do not render the staff shell.
- [x] Development role-preview controls remain globally reachable in development, remain separate from production navigation, and disappear in production builds.
- [x] Active route, active workspace, account context, keyboard focus, narrow-screen navigation, and sign-out states are visibly clear.
- [x] Route-level tests verify navigation visibility and access boundaries for each role.

## Verification

- Frontend: 25 Vitest tests passed, including six route-level shell and access-boundary tests.
- Backend: 19 Maven tests passed.
- Production: Vite build passed; the development role-preview overlay is absent from the production preview.
- Visual QA: verified at 1440x900, 1280x720, 768x1024, and 390x844 with no page-level horizontal overflow; the mobile staff drawer was opened and inspected.
