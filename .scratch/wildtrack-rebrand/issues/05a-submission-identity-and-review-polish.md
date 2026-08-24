# 05a - Submission identity and review feedback corrections

**What to build:** Apply the approved browser-review corrections across the public submission form, Student Dashboard, and deliverable-first Review so students can see and correct the roster identity they submit, team progress has a clear deliverable context, and Sir can scan or batch-check large review queues without misleading copy or oversized status treatments.

**Blocked by:** 01 - Mantine foundation and public form; 03 - Student Dashboard; 05 - Deliverable-first Review.

**Status:** implemented; live responsive browser verification pending because the browser bridge could not initialize

- [x] Public forms always show separate searchable Student Number, Student Name, and Team Code fields for first-time and returning students.
- [x] Selecting a Student Number or Student Name fills the corresponding roster Name, Number, and Team Code, while all three submitted values remain visible and editable.
- [x] Google identity and the remembered workspace association prefill the fields without replacing them with a locked identity summary or `Use a different student record` action.
- [x] Changing visible identity fields never reveals or prefills another Google identity's submitted values or Drive link, and only the owning identity can load its existing response for editing.
- [x] Public-form field sections remove duplicate headings, PDF explanations, roster-size counts, and unnecessary type-size changes while preserving required-field, Drive-link, deadline, validation, and submission clarity.
- [x] The unassociated Student Dashboard connection state is centered as a bounded form column and omits the available-record count.
- [x] Student team progress is shown per deliverable with submitted and expected member counts; any member breakdown exposes names/status only and never teammate links or response values.
- [x] The Review selection column uses a compact centered checkbox, and status columns use centered text-and-indicator treatments that remain stable without long filled pills.
- [x] Review deliverable rows align the short code, full title, due date, counts, and selection affordance consistently without stacked competing baselines.
- [x] Sir can run `Check all unchecked` once for every unchecked response in the selected deliverable, while row selection still supports custom subsets.
- [x] A complete Document Check batch may run with bounded internal concurrency, but progress covers every requested response, failures identify affected students, and user-facing copy does not expose worker counts or unrelated archive behavior.
- [ ] Route-level tests cover roster autofill in both directions, editable returning prefill, cross-account response privacy, per-deliverable team progress, review alignment semantics, full-queue Document Check, partial failures, and representative mobile/laptop layouts.

## Verification evidence

- `53` frontend tests pass, including public identity autofill/editability/privacy, per-deliverable team counts, and a `63`-response full-deliverable Document Check batch.
- The Vite production build succeeds.
- `git diff --check` reports no whitespace errors.
- Live mobile/laptop browser inspection remains open because the Codex browser bridge rejected its configured trusted runtime path before attaching to the local app.
