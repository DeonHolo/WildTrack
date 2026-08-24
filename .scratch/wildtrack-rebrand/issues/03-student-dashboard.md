# 03 - Student Dashboard

**What to build:** Migrate the Student Dashboard into a compact, student-focused view of personal identity, deliverables, Document Check results, adviser feedback, and team progress. Preserve privacy boundaries between Google identities and remove staff-only review noise.

**Blocked by:** 02 - Role-specific application shells.

**Status:** completed

- [x] A returning student sees a compact profile summary derived from the remembered workspace association rather than a permanent demo selector.
- [x] An unassociated Google identity receives the same inline Student Number connection flow used by the public form.
- [x] Deliverables render as a compact table or list that scales beyond the starter set without changing to a card layout.
- [x] Each deliverable shows only stable, student-relevant state, including whether a response exists, file accessibility when known, adviser feedback availability, and the relevant form or response action.
- [x] Staff-only AI Review content and internal queue statuses are not shown to students.
- [x] Long adviser feedback is truncated safely in the list and opens in an accessible dialog for complete reading.
- [x] Form links open in a new tab when the student chooses to submit or edit a response.
- [x] Team progress remains concise and does not expose another student's private Drive link or response fields.
- [x] Empty, loading, error, unmatched identity, signed-out, and populated states are complete on desktop and mobile.
- [x] Tests verify Google-identity ownership boundaries and that long content cannot distort the layout.
