# 12: Cross-browser persistence verification journey

**What to build:** One complete browser journey proving the sprint end to end: cleared-storage sign-in, associate, submit, verify from a second context, conflict resolution by staff, logout.

**Blocked by:** 01 - Wire student connect/disconnect to the server; 02 - Self-healing deliverable dedupe; 03 - Make backend failures visible; 04 - Staff logout in the Admin view; 05 - Identity conflicts in Today's Work; 06 - Adviser team scoping enforced server-side; 07 - Empty states and starter-data removal from production; 08 - Section switch preserves signed-in identity; 09 - AI Review foundation (checklist versioning + individual review); 10 - Live AI Review wired into Review page; 11 - Batch AI Review per deliverable.

**Status:** done

- [x] Cleared-storage journey passes: sign in, associate, submit, verify in second context.
- [x] Remove both the UI and backend of the ability to switch sections in the Student Dashboard.
- [x] Staff conflict resolution works inside the journey.
- [x] Logout ends the session everywhere.
- [x] Full frontend suite, backend suite, production builds, and accessibility checks pass.
- [x] README updated to describe the persistent system accurately.

