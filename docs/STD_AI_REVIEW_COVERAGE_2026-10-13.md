# STD AI Review coverage repair — 2026-10-13

## Observed production result

The STD batch finished at `2026-10-13T05:44:20.870621Z`. Its entry was `DONE`, with `resultStatus: COMPLETED` and an inconclusive-result warning. A completed batch means processing finished; it does not establish that the PDF passed a review.

Reading the saved report through the authenticated Review page confirmed:

| Saved value | Observation |
| --- | --- |
| Review status | `COMPLETED` |
| Generated at | `2026-10-13T05:44:17.270619Z` |
| Outcome | `INCONCLUSIVE` |
| Findings / missing required sections | 0 / 0 |
| Verified checks / verification notes | 0 / 0 |
| Failure code | None |

No new AI request was made during this inspection. The submitted Heroku screenshot contained successful status reads, without a Gemini response or failure diagnostic.

The batch entry's preparation preview still said `FAILED`. That preview describes the saved state when the batch was prepared; it is not the final report. The entry result and saved report established the current outcome.

## Confirmed defects and evidence limit

1. `ReviewSubmissionsTable` omitted `Inconclusive` from its aggregate status logic. A saved inconclusive report appeared as `Not reviewed`, although the detail drawer correctly showed the report. Rendered regressions reproduced this for a single PDF and mixed-artifact submissions.
2. The Gemini response schema exposed `verifiedChecks` but did not require the array. Its fresh-response parser also silently treated an omitted array as empty. A response with no findings, sections or checked evidence could therefore become a saved, uninformative inconclusive report.

The production report retained no proposed-versus-accepted counts. It does not establish whether Gemini omitted checks, returned an empty array, or supplied evidence that grounding rejected. That specific cause remains unverified for this attempt.

## Repair

- Require `verifiedChecks` in the new generation schema and parser; bump the provider schema cache version to `structured-review-v4-compact`.
- Keep an explicitly empty array valid when the available evidence cannot support checks. Do not manufacture evidence or weaken grounding to obtain a positive result.
- Preserve deserialization of older saved reports independently of the fresh-response contract.
- Explain zero-evidence and single-check inconclusive results accurately. A zero-evidence report directs staff to review the original PDF without referring to nonexistent citations.
- Log only outcome and proposed/accepted counts after grounding. Do not log student identities, PDF passages, provider output, URLs or credentials.
- Show `Inconclusive` in the submissions table with the warning tone, while preserving `Retry required` and `Reviewing` precedence.

The model, generation settings, independent-evidence threshold, review history and explicit retry confirmation remain unchanged. No automatic Gemini retry was added.

## Verification and release

Local verification passed:

- 679 frontend tests across 58 files.
- 141 backend tests across provider, deduplication, metadata grounding, template crosscheck and batch lifecycle suites; external providers were disabled.
- 24 browser checks in the role-flow suite, including a saved inconclusive report opening and surviving reload with no AI write request.
- Frontend production build and backend package build.
- Independent review found no actionable defects.

The owner authorized merging to `main` and testing the live STD review in the signed-in browser. Deployment and hosted results will be recorded separately. Local fixtures do not establish live review quality.
