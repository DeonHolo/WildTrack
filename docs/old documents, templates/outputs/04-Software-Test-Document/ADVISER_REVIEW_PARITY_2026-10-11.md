# Adviser artifact card parity - 11 October 2026

The user requested that **My advised teams** artifact cards match Admin Review, excluding **Rerun Document Check** and **Rerun AI Review**.

`frontend/src/pages/AdviserViewPage.jsx` now uses the Admin card spacing, border radius, artifact heading size and the shared `wt-review-detail-section` and `wt-review-artifact-actions` styles. **View Document Check** and **View AI Review** sit in one wrapping action row above the summaries. View AI Review now has the same light maroon styling and eye icon as Admin Review. The AI Review status has its own labeled row below the Document Check summary.

Existing adviser permissions and artifact targeting are preserved. No AI run, retry or rerun control was introduced, and no separate Document Check rerun control was added. Previously available initial checks, saved current/legacy/historical report viewing, selected-output acceptance, feedback and workspace scoping still use their existing handlers. Detailed AI findings remain in the saved-review modal.

Validation: **78 existing frontend tests passed** across AdviserViewPage, ReviewResponseDrawer and ReviewPage; the production frontend build passed. These are local component/request-layer tests, not a hosted visual acceptance claim. No new provider request was made. The change is ready for a follow-up PR and is not covered by the earlier PR96 merge approval.

No STD DOCX, PDF or ZIP was edited.
