# 11 - Legacy presentation cleanup and full UI verification

**What to build:** Complete the migration by removing superseded presentation code and verifying WildTrack as one coherent interface across all roles, routes, workspaces, content lengths, and supported viewports. This ticket does not add new product behavior; it closes inconsistencies left by incremental migration.

**Blocked by:** 01 through 10, including 05a - Submission identity and review feedback corrections.

**Status:** ready-for-agent

- [ ] No migrated route depends on obsolete CapVault visual tokens, duplicate hand-built standard controls, or conflicting global component styles.
- [ ] Product-facing copy consistently uses WildTrack and contains no development, MVP, fallback, or internal-tier terminology.
- [ ] Mantine theme defaults produce consistent buttons, fields, dialogs, notifications, tables, links, and focus behavior across every route.
- [ ] No page contains unintended nested cards, escaped controls, overlapping text, detached pagination, or horizontally clipped student-facing content.
- [ ] Staff routes remain usable with at least 318 students, long team codes, long names, long feedback, multiple statuses, and many deliverables.
- [ ] Public form and Student Dashboard pass mobile checks at approximately 390x844 and tablet checks at approximately 768x1024.
- [ ] Staff pages pass laptop and desktop checks at approximately 1280x720 and 1440x900.
- [ ] Keyboard navigation, accessible names, visible focus, dialog focus management, semantic status text, contrast, and reduced-motion behavior are verified.
- [ ] Frontend unit/component tests, browser flow tests, production build, and existing backend test suite pass.
- [ ] Final screenshots are captured for Sir/Admin, adviser, student, and public-form flows and reviewed for visual consistency.
