# 05 - Deliverable-first Review

**What to build:** Replace the card-heavy admin Review page with a deliverable-first operational inbox. Sir should move from deliverable counts to compact response rows and inspect one selected response without losing table context.

**Blocked by:** 02 - Role-specific application shells.

**Status:** completed

- [x] The initial view lists deliverables with expected, received, missing, unchecked, needs-action, accepted, and archived counts using compact rows rather than response cards.
- [x] Opening a deliverable reveals a compact searchable and filterable response table capable of handling hundreds of students.
- [x] The default filter prioritizes pending work while accepted and archived responses remain reachable through explicit filters.
- [x] Selecting a response opens a stable detail drawer or panel containing submitted-file actions, Document Check, existing AI Review, acceptance, and archive controls.
- [x] Status presentation uses stable columns or reserved regions so adding a status does not reflow the entire row.
- [x] Accepted responses leave active attention queues immediately and can be unaccepted through the approved confirmation flow.
- [x] Individual and batch Document Check controls report progress, partial failures, and completion without blocking unrelated navigation.
- [x] Individual and batch AI Review controls remain available only to Sir/Admin.
- [x] File links open the submitted resource rather than an empty browser tab.
- [x] Tests cover filters, selected-response persistence, batch selection, queue removal, role restrictions, and long AI or Document Check summaries.
