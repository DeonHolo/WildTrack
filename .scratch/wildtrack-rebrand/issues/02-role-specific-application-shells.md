# 02 - Role-specific application shells

**What to build:** Replace the shared CapVault navigation with WildTrack shells tailored to Sir/Admin, advisers, students, and public forms. Preserve current route behavior and workspace context while making production navigation distinct from development-only role preview controls.

**Blocked by:** 01 - Mantine foundation and public submission form.

**Status:** ready-for-agent

- [ ] The product name and shared navigation surfaces display WildTrack rather than CapVault.
- [ ] Sir/Admin receives a compact staff shell with institution-wide operations, persistent workspace context, and direct access to assigned teams without a production role switch.
- [ ] Regular advisers receive only assigned-team review and permitted tracker navigation.
- [ ] Students use a lightweight top navigation centered on dashboard and Google account actions.
- [ ] Public forms remain distraction-free and do not render the staff shell.
- [ ] Development role-preview controls remain globally reachable in development, remain separate from production navigation, and disappear in production builds.
- [ ] Active route, active workspace, account context, keyboard focus, narrow-screen navigation, and sign-out states are visibly clear.
- [ ] Route-level tests verify navigation visibility and access boundaries for each role.

