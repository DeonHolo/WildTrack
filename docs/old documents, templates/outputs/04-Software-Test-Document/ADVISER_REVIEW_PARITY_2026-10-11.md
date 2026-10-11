# Adviser artifact card parity - 11 October 2026

The user requested that **My advised teams** artifact cards match Admin Review, excluding **Rerun Document Check** and **Rerun AI Review**.

`frontend/src/pages/AdviserViewPage.jsx` now uses the Admin card spacing, border radius, artifact heading size and the shared `wt-review-detail-section` and `wt-review-artifact-actions` styles. **View Document Check** and **View AI Review** sit in one wrapping action row above the summaries. View AI Review now has the same light maroon styling and eye icon as Admin Review. The AI Review status has its own labeled row below the Document Check summary.

Existing adviser permissions and artifact targeting are preserved. No AI run, retry or rerun control was introduced, and no separate Document Check rerun control was added. Previously available initial checks, saved current/legacy/historical report viewing, selected-output acceptance, feedback and workspace scoping still use their existing handlers. Detailed AI findings remain in the saved-review modal.

Validation: **78 existing frontend tests passed** across AdviserViewPage, ReviewResponseDrawer and ReviewPage; the production frontend build passed. GitHub frontend checks and Vercel preview also passed for head `0b3a8c6b79980d085718e6439411fa0d79f488bf`.

The user separately approved PR97. It merged as `c15da2da4dab9efd7fb85d8f31c906cce135a45d`. Vercel Production deployment `6997377464` succeeded at 2026-10-11 15:04:55 UTC; Heroku `wildtrack` deployment `6997376018` succeeded at 15:05:34 UTC.

Hosted verification: opened **My advised teams > CapVault > STD** in the live app. The card displayed the two saved-report actions together, with the eye icon and labeled AI Review status, and neither rerun control. View AI Review opened the saved **AI Review: STD Submission** modal. No new Gemini request was made. The local proof image is `.scratch/ui-followup-20261011/adviser-live-actions.png`.

No STD DOCX, PDF or ZIP was edited.
