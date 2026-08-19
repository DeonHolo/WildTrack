# 04 - Forms management

**What to build:** Migrate form publishing and maintenance into a scalable Mantine interface. Preserve one published form per deliverable, stable public links, and response history across edits and unpublishing. Continue using the bundled WildTrack public-form banner; configurable artwork management is deferred because it adds staff-page weight and requires durable media storage rather than browser-local base64 data.

**Blocked by:** 01 - Mantine foundation and public submission form; 02 - Role-specific application shells.

**Status:** completed

- [x] Published forms render in a compact scalable table with due date, status, link, and immediately visible actions.
- [x] Clicking the public link opens it, while a separate icon-only action copies it and reports success accessibly.
- [x] Creating a form for an already-published deliverable updates that form instead of duplicating it.
- [x] Editing uses a dedicated dialog with current values prefilled.
- [x] Unpublishing affects only the selected form, preserves responses and history, and requires a clear confirmation.
- [x] Due date and time controls align correctly, use the approved date separator in display text, and default new forms to the current date at 11:59 PM.
- [x] The public form continues to use the bundled responsive WildTrack banner.
- [x] Tests cover create, edit, duplicate prevention, unpublish isolation, and link actions.
