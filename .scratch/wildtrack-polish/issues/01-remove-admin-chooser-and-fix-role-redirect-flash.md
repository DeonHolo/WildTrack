# 01: Remove Admin Chooser and Fix Role Redirect Flash

**What to build:**
1. Remove the blocking  Choose a capstone section screen for administrators; admins automatically enter their primary dashboard with multi-section management handled via the header dropdown.
2. Introduce a session resolution gate so page refreshes never momentarily flash or redirect to /student or /login while backend authentication is in-flight.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Administrators entering / directly see Today''s Work immediately without an upfront section selection screen.
- [x] Changing workspaces remains fully functional via the header select dropdown in the staff application shell.
- [x] Refreshing the dashboard while authenticated as admin does not flash /student or trigger an intermediate redirect.
- [x] Tests verify direct dashboard rendering and redirect prevention during session hydration.

