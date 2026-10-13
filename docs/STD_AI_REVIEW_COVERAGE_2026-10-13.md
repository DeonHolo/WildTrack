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

The owner authorized merging to `main` and testing the live STD review in the signed-in browser. Local fixtures do not establish live review quality.

## Hosted release and first live retest

PR #106 merged to `main` at `2026-10-13T06:24:26Z` as `3ed1cea92392450ced147c582384a59b77e00c2c`.
Vercel's production deployment for that revision was `READY`; Heroku's deployment succeeded at `2026-10-13T06:25:35Z`.

One fresh STD attempt followed. Batch `dfb07ee3-d66d-4c12-80f9-ffa0ce4a38f5` completed at
`2026-10-13T06:28:31.649440Z`, with one selected document and zero reused results. Its saved report still had
zero findings, sections, verified checks and verification notes, and outcome `INCONCLUSIVE`.

The signed-in Chrome Review page showed `Inconclusive` in both the submissions table and artifact drawer.
Document Check showed a readable, accessible 58-page PDF with 158,570 extracted characters. The missing AI
coverage therefore cannot be explained merely as an inaccessible or empty document.

The Heroku application log at `2026-10-13T06:28:28.289Z` contained:

```text
AI review grounded: outcome=INCONCLUSIVE proposedFindings=0 acceptedFindings=0 proposedSections=0 acceptedSections=0 proposedChecks=4 verifiedChecks=0 verificationNotes=0
```

This establishes that Gemini supplied four checks and the application discarded all four. It does not identify
the specific rejection rules: neither the old report nor this counts-only diagnostic retains the proposed passages.
No additional provider request was made while inspecting that saved result and the logs.

## Follow-up validation correction

Inspection of `AiReviewService#bodySectionTopic` exposed a separate, reproducible defect. An aspect such as
`Test Plan body section describes scope and environment` made positive-check validation infer the words after
`body section` as the section name. Valid quoted evidence in the actual `Test Plan` section was discarded.
The `body subsection` spelling also bypassed that section-specific validation.

The correction recognizes a named body heading before the marker and still requires the exact quoted evidence
to belong to that section. Subsections receive the same validation. It does not relax document-quote or authority
matching, accept table-of-contents evidence as body content, or change the two-independent-check threshold.
The review cache fingerprint advances to `wildtrack-academic-review-v18`.

The grounding diagnostic now reports fixed rejection labels and counts, including `DOCUMENT_QUOTE_NOT_FOUND`,
`BODY_SECTION_MISMATCH` and `AUTHORITY_QUOTE_NOT_FOUND`. PDF passages, provider output, identities, URLs and
credentials are excluded. No automatic AI retry is introduced.

Local evidence:

- Two of the three new section-scope regressions failed before the correction and all three passed afterward.
- 197 backend tests across seven suites passed with external providers disabled, including a log-privacy
  regression and existing evidence, authority, template, deduplication and batch-lifecycle checks.
- The backend package build passed.

Whether the named-section defect caused the four rejections in the earlier live STD remains unverified.
The next hosted attempt must establish the accepted evidence or the newly reported rejection reasons.
