# 04 - Forms and artwork management

**What to build:** Migrate form publishing and maintenance into a scalable Mantine interface and add complete management of workspace-default and per-form header artwork. Preserve one published form per deliverable, stable public links, and response history across edits and unpublishing.

**Blocked by:** 01 - Mantine foundation and public submission form; 02 - Role-specific application shells.

**Status:** ready-for-agent

- [ ] Published forms render in a compact scalable table with due date, status, link, and immediately visible actions.
- [ ] Clicking the public link opens it, while a separate icon-only action copies it and reports success accessibly.
- [ ] Creating a form for an already-published deliverable updates that form instead of duplicating it.
- [ ] Editing uses a dedicated dialog or drawer with current values prefilled.
- [ ] Unpublishing affects only the selected form, preserves responses and history, and requires a clear confirmation.
- [ ] Due date and time controls align correctly, use the approved date separator in display text, and default new forms to the current date at 11:59 PM.
- [ ] Sir can configure one workspace-default form header and an optional override for an individual deliverable.
- [ ] Artwork can be previewed, replaced, repositioned, and removed; removing an override falls back to the workspace image and then the bundled placeholder.
- [ ] Header artwork changes do not alter the form slug or response ownership.
- [ ] Tests cover create, edit, duplicate prevention, unpublish isolation, link actions, artwork fallback, and responsive preview behavior.

