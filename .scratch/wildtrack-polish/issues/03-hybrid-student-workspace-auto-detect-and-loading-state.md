# 03: Hybrid Student Workspace Auto-Detect and Loading State

**What to build:**
1. When an unconnected student searches their Student Number or Name on a generic URL, search across all active capstone rosters (e.g. IT332 and CS Capstone). Selecting their record automatically assigns and switches to their workspace.
2. Retain a clear section indicator and section switcher on the student dashboard as a safety net.
3. Replace the premature  Student records are not available yet message with an appropriate loading skeleton/indicator while backend roster data is hydrating.

**Blocked by:** 01 (shares session and workspace initialization flow).

**Status:** done

- [x] Searching student identity matches across all active workspace rosters when no workspace has been pre-selected.
- [x] Selecting a matching student switches the active workspace and confirms the connection in the proper section context.
- [x] Connected students can view and switch their section from their dashboard.
- [x] Initial data loading displays a loading placeholder rather than an alarming Student records are not available yet empty warning.
- [x] Tests cover multi-workspace roster search, automatic section switching, and loading states.

