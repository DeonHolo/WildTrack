# 08 - Workspace, imports, and templates

**What to build:** Migrate academic workspace setup, source imports, column mapping, deadline suggestions, deliverable columns, and official template management into a clear operational page. Preserve isolation between IT and CS workspaces and distinguish imported, starter, missing, and disconnected states accurately.

**Blocked by:** 02 - Role-specific application shells; 04 - Forms and artwork management.

**Status:** implemented

- [x] Workspace source controls use consistent dimensions and clearly identify Team Formation, Tracker, and Software Project Monitoring responsibilities.
- [x] Import summaries are source-specific and report found, mapped, optional, missing, unrecognized, skipped, and deadline-row data without reusing an irrelevant generic summary.
- [x] Known source layouts produce editable mapping suggestions rather than fixed positional assumptions.
- [x] Detected deliverables and deadlines can generate suggested forms in chronological order without duplicating an existing deliverable form.
- [x] Deliverable columns remain collapsible and editable after import.
- [x] Official template management supports upload, Drive-link entry, meaningful filename-derived defaults, preview/open, replace, and remove actions.
- [x] Starter data, imported data, and connection status are labeled consistently for every workspace.
- [x] Restoring starter data affects only the active workspace, preserves the workspace record itself, and uses a confirmation that makes the required typed word unmistakable.
- [x] Switching workspaces does not resurrect stale deliverables, imports, forms, or other workspace data from another profile.
- [x] Tests cover source mismatches, missing required mappings, deadline detection, suggested-form generation, workspace isolation, template actions, and reset behavior.


## Implementation notes

- Workspace sources now use one operational table with source-specific responsibilities, statuses, links, and import actions.
- Import previews retain detected headers, editable mappings, optional and missing fields, unrecognized columns, skipped rows, and deadline suggestions even when the backend performs the authoritative import.
- Saved mapping overrides are sent to the backend and participate in header-row detection before required-field validation.
- Official templates support local DOCX/PDF upload, Google Drive retrieval, filename-derived names, opening stored copies, replacement, and removal within the active workspace.
- Asynchronous imports and template mutations refuse to update the visible state after the user switches workspaces.
- Verified with 73 frontend tests, 21 backend tests, and a successful production frontend build.