# 07: Empty states and starter-data removal from production

**What to build:** Production starts genuinely empty with instructive empty states; reset-to-starter becomes local-development-only behind confirmation; fresh browsers get an explicit section choice instead of silently opening the wrong workspace.

**Blocked by:** 03 - Make backend failures visible.

**Status:** done

- [x] Production initial state contains no seed students, deliverables, or fake titles.
- [x] Empty states instruct the user what to do (import Tracker sheet) instead of showing starter rows.
- [x] Reset-to-starter appears only in development and requires explicit confirmation.
- [x] A fresh browser without stored workspace preference shows an explicit section chooser before loading data.
- [x] Tests cover empty-state rendering, dev-only reset gating, and the chooser path.
