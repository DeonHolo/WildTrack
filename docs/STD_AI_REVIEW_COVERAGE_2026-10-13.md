# STD AI Review coverage repair — 2026-10-13

## Prompt v20/v21 body-evidence repair — 20 October 2026

The first live v20 SRS attempt returned an invalid provider response and was discarded; an explicit retry retained five body observations but still produced seven figure-verification notes. The live batch's prepared-PDF copy discarded the new `illustratedArtifacts` field. Two RAM/disk preservation tests and one cached-grounding test reproduced the loss (three failures before repair). The v21 follow-up preserves the metadata through snapshot copies and invalidates earlier report contexts. Final deployment/retest results are recorded in the submitted QA evidence index.

Three current inconclusive reports were traced through their saved backend results, current PDF bytes, extracted pages and isolated provider replies. The PDFs contained 59, 75 and 65 pages, with 73,908, 72,331 and 117,479 extracted characters. Their bytes matched the backend job hashes. The full PDFs were sent; this was not an input-size truncation.

The saved reports each retained only one observation. Original raw provider responses were not retained, so a specific original rejection cannot be reconstructed from the stored reports alone. Fresh controlled runs exposed three general causes:

1. Six isolated citation lines gave too little coherent body context; some were index entries or sentence fragments.
2. The model sometimes presented student-authored requirements as quotes from the official template or upload instructions. Exact-authority validation correctly discarded those checks.
3. The SRS accumulated seven synthetic graphical verification notes even though its diagrams were present. Physical inspection located the figures, including images continuing onto a page that later starts another transaction.

The repair prepares up to 20 coherent source passages and has Gemini select short identifiers rather than reconstruct quotations. The server attaches the original text and retains strict evidence, authority and independence validation. Positive observations describe document content; obligation-based concerns remain separate. Physically associated figures no longer generate automatic missing-figure uncertainty, while genuine missing labels, explicit placeholders, ambiguous layouts and provider concerns still need attention. The two-observation minimum remains unchanged.

The shared implementation contains no student-name, document-hash, page-count or project-specific exceptions. Gemini stays on `gemini-3.5-flash-lite`, `MINIMAL`, with the same output limit and one-request behavior. No database migration or automatic retry is introduced.

Validation passed 346 backend tests, with seven opt-in tests skipped and no failures or errors. The 17-PDF replay still removed all 20 known false acronym warnings and retained all 11 confirmed missing-term warnings. Tests additionally cover wrapped body context, metadata-only citations, overlapping quotations, invalid/mismatched reference labels, absent figures, logos, unrelated images and figures continuing before a new transaction on the following page.

All three isolated requests under the final source-reference contract returned provider responses. Replaying those exact responses through the completed parser/grounding implementation retained three SDD, four SRS and four SPMP observations, with no unresolved verification notes. One oversized SDD observation label was excluded without discarding the other valid observations. These are bounded diagnostic results, not an overall accuracy percentage. Saved production reviews were unchanged during isolated diagnosis.

## Prompt v19 accuracy-repair addendum — 20 October 2026

The bounded follow-up retains `gemini-3.5-flash-lite`, `MINIMAL` thinking and an 8,192-token output limit. Isolated fresh reviews R02, R07, R12, R14 and R17 returned successfully in 7.349, 12.005, 11.259, 16.887 and 9.756 seconds. Production saved-review settings were unchanged. The observations remain advisory evidence for staff review, with no blanket accuracy score or provider-400 cure claim.

Regression targets cover corrected whitespace, wrapped and grouped glossary/comma matching; equivalent Use Case Item/Description tables; numbered-flow range boundaries; page-aware figure inspection as advisory; genuinely unfilled author instructions; meaningful source quotes, accurate aspect labels and physical page evidence; and unsupported identity allegations.The 20 October 2026 regression run passed 235 checks with one skipped, zero failures and zero errors. Replay covered 17 distinct PDFs represented by 18 saved records: all 20 known false acronym warnings were removed and all 11 confirmed missing-term warnings were retained. Five isolated fresh Gemini requests completed successfully; saved student reviews, decisions and production settings were unchanged. These are bounded regression results.

**Latest checkpoint:** PR #109 achieved the real saved STD review described under “Hosted acceptance”; PR #110 subsequently removed duplicate observed-check labels and was verified against saved STD and SDD reports. Earlier failed/inconclusive attempts remain dated evidence, not current unresolved status. See [the session index](SESSION_CHANGE_INDEX_2026-10-13.md).

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

## Second hosted attempt: confirmed source/requirement mismatch

PR #107 merged at `2026-10-13T13:58:18Z` as `6d79a94b36f94ee7884eb0c392cc4ee49da7d368`.
Vercel's production deployment was `READY`; Heroku deployment `7040493686` succeeded at
`2026-10-13T13:59:35Z` (release `v136`). The live page correctly made the earlier report historical under
the new review fingerprint.

One document was selected in the signed-in Chrome browser. Batch `bbbe6397-826d-4b7c-8dbf-dda2a4a35fea`
sent one start request. Its provider attempt failed at `2026-10-13T14:03:32.612Z` with:

```text
Gemini AI review failure: stage=response_validation code=INVALID_RESPONSE detail=document_check_has_requirement
AI review failure: stage=provider code=INVALID_RESPONSE exception=Failure
```

The saved-result endpoint returned `UNCERTAIN`, `failureCode: INVALID_RESPONSE`, and no current report.
The earlier report remained available with its original generation time. No automatic retry was sent.

This failure occurred before grounding: at least one provider check had source `DOCUMENT` with a nonempty
requirement. The compact schema allowed that combination, although the prompt prohibited it. The parser
rejected the entire response instead of letting grounding discard that unsafe check individually. This cause
is confirmed for this attempt; it does not establish why the four checks in the earlier attempt were rejected.

## Source-pair correction

- Use two compact schema alternatives: document observations have source `DOCUMENT` and an empty requirement;
  authority checks use `DELIVERABLE_REQUIREMENTS` or `OFFICIAL_TEMPLATE` and quote the supplied authority.
- Preserve bounded, typed source/requirement pairs when parsing. Grounding still rejects contradictory pairs,
  absent authority quotes and unverified PDF evidence individually. Do not erase the supplied requirement,
  change the source, or turn an invalid check into accepted evidence.
- Continue rejecting malformed arrays, unknown sources, wrong field types, missing evidence and excessive output.
- Advance the provider fingerprint to `structured-review-v5-source-pairs-compact`. Preserve the model,
  generation settings, explicit empty-array behavior, saved-report compatibility and no-automatic-retry policy.

The [Gemini generation API reference](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig)
lists `anyOf`, `enum`, `properties` and `required` among the supported JSON Schema properties. The schema
remains limited to the existing five report fields and at most five positive checks.

Local verification passed 199 backend tests across seven suites. Regression coverage exercises the HTTP
response parser followed by grounding: valid independent observations survive an unusable check, and an
invalid source/requirement pair alone cannot produce a positive result. The new schema and both semantic
regressions reproduced failures before this correction. The backend package build passed. Hosted acceptance is still pending.

## Third hosted attempt: exact citation mismatch confirmed

PR #108 merged at `2026-10-13T14:20:41Z` as `4c1e6fa01ce0902a9635f8055f999f00f3e509c1`.
Vercel's production deployment was `READY`; Heroku deployment `7041035007` succeeded at
`2026-10-13T14:21:55Z`.

A fresh single-document attempt completed and saved an `INCONCLUSIVE` report at
`2026-10-13T14:24:23.016838Z`. Its failure code was empty: the source-pair parser failure was resolved.
The application diagnostic at `2026-10-13T14:24:23.014Z` established the remaining rejection reason:

```text
AI review grounded: outcome=INCONCLUSIVE proposedFindings=0 acceptedFindings=0 proposedSections=0 acceptedSections=0 proposedChecks=4 verifiedChecks=0 verificationNotes=0 rejectedChecks={DOCUMENT_QUOTE_NOT_FOUND=4}
```

All four proposed passages failed exact normalized matching against the application's extracted PDF text.
The log does not retain the passages, so it does not establish whether the mismatch arose from paraphrasing,
visual reading order, formatting, or another difference. Do not weaken evidence matching to force a positive result.

## Exact citation references

`AiReviewGroundingPolicy#positiveEvidencePassages` selects at most six distinct source lines of at most 320
characters, spread through the extracted body. The existing reliable-body boundary excludes cover and
table-of-contents material when a contents section exists. Numbered headings, explicit placeholders, sparse
lines and normalized duplicates are excluded. Long lines are clipped at an existing word boundary.

The full PDF is still supplied once for findings and requirements. Only the bounded reference passages are
also supplied as data. Positive-check citation strings are constrained to those exact passages in the generation
schema; authority pairing and subsequent server-side evidence validation still apply. If no eligible references
exist, the schema allows no positive checks. Selecting an excerpt does not itself establish a checked observation
or academic correctness. Absence of findings remains limited to cited areas, with the independent-check threshold
and no-automatic-retry policy unchanged.

The provider fingerprint advances to `structured-review-v6-source-passages-compact`. No model or generation
settings change, and no external-service configuration or user permission flow is added.

Verification:

- 204 backend tests across eight maintained suites passed, including a response-contract-to-grounding regression
  for an exact citation containing a PDF line-break hyphen, bounded/distributed excerpts, exclusions and duplicates.
- A separate offline probe of the local `WildTrack_STD.pdf` export found 58 pages, six reference passages and five
  accepted supplied citations. No provider was called. That export's 158,725 extracted characters differ from
  the older hosted Document Check's 158,570; byte identity with the hosted file was not established.
- The probe and count/hash receipt are retained privately under `.scratch/std-coverage-20261013/` and are not
  committed as test fixtures. Hosted Gemini acceptance is still pending.

## Hosted acceptance: passed for the submitted STD

PR #109 merged at `2026-10-13T14:52:32Z` as `7362a21a14906c6abebd380f64c295ec3beaffb0`.
GitHub's checks passed. Vercel production deployment `dpl_97KsMEMrEoQQCPZioS7Zb5UmZu9D` was `READY`
for that revision; Heroku deployment `7041814911` succeeded at `2026-10-13T14:53:33Z`.
The backend package build also passed.

Using Chrome DevTools with the existing signed-in administrator session, one STD document was selected and
started. Batch `150248ea-881d-4cfe-aea4-007e31cde528` completed at `2026-10-13T14:55:24.783342Z`:
one selected/completed document, zero reused documents, entry `DONE`, result `COMPLETED`, and no entry error.

The application log at `2026-10-13T14:55:20.873Z` contained:

```text
AI review grounded: outcome=NO_ISSUES_IN_CHECKED_AREAS proposedFindings=0 acceptedFindings=0 proposedSections=0 acceptedSections=0 proposedChecks=3 verifiedChecks=3 verificationNotes=0 rejectedChecks={}
```

The authenticated saved-report endpoint returned `COMPLETED`, generated at
`2026-10-13T14:55:20.874952Z`, with three verified checks and no failure code. The live table and artifact
drawer both showed `Reviewed`. Opening the report displayed all three source excerpts under `Observed checks`.

A page reload, renewed STD selection and reopened report retained the same generation timestamp, outcome
and three checks. Reads returned HTTP 200; Chrome showed no console errors. No AI write request was sent
after reload. The report remained open in Chrome, and an inline screenshot of its actual rendered contents
was captured through Chrome DevTools.

This demonstrates the live request, completion, saved-report, display and reload path for this STD. It does
not establish full template compliance, academic approval, correctness of every semantic observation, or
benchmark accuracy across other documents. The displayed outcome remains deliberately scoped to checked areas.

## Saved-report presentation follow-up: PR #110

The owner's later SDD screenshot revealed duplicate “Submitted document” lines. The same duplication was reproduced in the saved STD report. The cause and correction in `AiReviewReport#CheckRow` / `#Evidence`, release revision and deployment receipts are in [the readability record](AI_REVIEW_READABILITY_REDESIGN_2026-10-09.md#13-october-follow-up-duplicate-observed-check-labels).

After PR #110 deployed, a cache-bypassing signed-in Chrome reload and reopening both reports showed one label and one passage per observation: three STD checks and four Refactored SDD checks. STD retained its 10:55 PM Singapore review date; SDD retained 11:12 PM. No AI write requests or console errors occurred. This is presentation and saved-report persistence evidence, not a new Gemini attempt or a semantic accuracy score.
