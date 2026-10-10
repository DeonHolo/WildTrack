# Requested review and Forms changes — 10 October 2026

Implementation: https://github.com/DeonHolo/WildTrack/pull/95, from `wildtrack-dev` to `main`. The PR is unmerged; production screenshots can still show the older UI. Keep unrelated coursework and frozen evidence intact.

| Request | Implemented behavior |
| --- | --- |
| File History readability | Owner/editor information first; Recorded checks and Google Drive edits are separate; consistent type and spacing; hashes behind Technical record details. Student identity redaction remains enforced. |
| Long observed history | Latest three checks visible; one Earlier checks disclosure expands all older entries. Exact evidence remains available. |
| Today’s Work sorting | Priority stays the default; Newest activity and Oldest activity sort before pagination and preserve filtering and actions. Mobile search spacing is corrected. |
| Conflicting team files | Explicit current-output choice with selection feedback; warnings and acceptance refer to the chosen output. Accepting a file does not silently resolve another file conflict. |
| Forms Add Button | Renamed Add question and styled as a clear authoring action. |
| Question dragging | A lifted card preview, insertion cue and drop feedback show the intended position; keyboard move actions remain available. |
| New question visibility | New card is highlighted, scrolled into view and its label focused/selected. |
| Field-type dropdown | Bounded scrollable menu with full labels, avoiding clipping behind adjacent cards. |
| Rejected type change followed by delete/save | Removing the field retires its original persisted definition; the rejected draft type does not leak into save. Previous answers survive, Undo remains available, and replacement fields persist after reload. |
| AI batch choice | Preparation precedes consent; choose Documents needing attention or Include successful reviews too. |
| Updated files versus saved AI reviews | Verify current PDF bytes and current review requirements; disclose mismatching saved reviews and allow inclusion of updated documents. |
| Duplicate counts | Show verified unique review groups separately from total PDF submissions. Identical bytes share work only within the same workspace/team/deliverable/artifact/requirements scope. Different links alone do not establish identical content. |
| Continue a paused batch | Continue pending work; do not silently repeat completed or uncertain provider attempts. Fresh retries keep explicit acknowledgement. |
| Individual review during a batch | Reuse the saved status for an in-flight target; show a clear conflict message for queued or unrelated overlap. |
| Navigate away while reviewing | Server-persisted batches continue independently of the page; returning restores saved progress. |
| AI report title | Use the deliverable name instead of the form field’s PDF Drive Link label. |
| SDD/STD Drive 503 and file limit | Added secret-safe stage, upstream status, timeout and cause diagnostics. Actual hosted cause is still unconfirmed. The local PDFs are below the existing 25 MiB limit; it was not raised speculatively. |
| Misleading Drive history setup message | Separate NOT_CONFIGURED (server connection) from NOT_CONNECTED (submitter consent); signing into WildTrack alone is not a revision permission grant. |
| Outdated check status | Use the artifact’s saved source URL when present so unrelated answer edits do not falsely stale the PDF. Preserve legacy timestamp fallback; explain real stale results with attention styling. |
| STD evidence | Updated the existing DOCX’s A.5 appendix and evidence package with local enhancement regressions while retaining the original 50 completed baseline cases. Export the updated DOCX again before submitting a new PDF. |

Metadata means file facts such as owner, editor and modified time. Recorded checks are snapshots saved during WildTrack inspections and start with its first check. Google revision metadata is a separate optional read-only connection; it may return retained revisions before submission, but cannot guarantee a complete history or recreate missing older checks. Neither metadata list stores old downloadable PDFs or proves authorship.

An Outdated label does not disable tracking or start Gemini. A fresh successful Document Check clears it. Existing workspace monitoring can recheck eligible selected files independently when enabled; it polls on its schedule, not just because a label is visible. It skips finalized archived response versions. Normal intervals are five minutes around deadlines and one hour outside that window, subject to request budget and provider backoff.

Verified: frontend 612/612; affected browser role flows 23/23; history access 12/12; batch/cache/store 50/50; Drive gateway 5/5; actual local Spring/H2/browser form-retirement journey PASS; production build PASS. Browser preview data and provider tests are fixtures, not fresh Gemini accuracy or hosted acceptance.

Next: finish PR checks, obtain merge approval, deploy and retest real history setup and the SDD/STD retrieval incident. Do not mark the live 503 resolved from local tests. The updated DOCX is the editable current output; the existing PDF is the historical baseline until rendered again.
