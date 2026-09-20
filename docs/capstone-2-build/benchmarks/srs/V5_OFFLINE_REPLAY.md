# v5 production postprocessor: offline replay, not a second Gemini pilot

**Date:** 2026-09-21 (Asia/Manila). **Code:** `wildtrack-academic-review-v5` on `wildtrack-rebrand`, proposed in PR #53. This document describes an engineering regression after the separately frozen v4 provider pilot. It is not an amendment to that experiment's results or reference labels.

## Historical provider observations remain unchanged

The v4 pilot generated six fresh HTTP 200 Gemini reports using six frozen, fictional SRS PDFs derived from generic structural observations of the owner's locally inspected SRS and template. Four of its six predefined synthetic engineering conditions were observed. Gemini omitted the actual body-section gaps in SRS-04 (2.4 Constraints appears only in the table of contents) and SRS-05 (3.1.3 Communications interfaces is absent from both contents and body). The original v4 parsed and postprocessed reports, provider responses, frozen hashes, one-shot attempt ledger, and 4/6 result remain unmodified in `results/srs-followup-20260921/`.

## Separate v5 implementation and check

The *production* `AiReviewService.groundAndValidate` path now compares confidently recognized **numbered body headings** in a supplied mapped official template with the submitted PDF's **body**, independent of whether Gemini named an omission. A table-of-contents entry does not count as a body heading. Findings have an exact quoted template source and state that the matching body heading was **not detected**; they explicitly ask the reviewer to confirm applicability and possible equivalent headings. The app does **not** turn template layout into an automatically mandatory academic requirement, and these advisories do not populate `missingRequiredSections`. The policy skips explicit optional/conditional headings, uncertain body boundaries, absent mapped templates, and wholly unrecognized document structures; it limits added findings to prevent flooding. Existing provider-proposed optional template omissions are also filtered. The review prompt/cache fingerprint moved to v5 so that old stored v4 reports remain untouched rather than silently reused with new postprocessing.

Offline tests reloaded the **same six already-saved v4 raw structured provider reports**, the original frozen **synthetic** PDFs, their safe synthetic mapped template, and their instructions. They invoked `AiReviewService.postprocessForBenchmark`, which delegates to the exact live postprocessing method. Under v5, SRS-04 now receives the source-backed *Constraints* body-heading advisory and SRS-05 receives the *Communications interfaces* advisory. Present headings in the populated SRS-02 control and the partly populated SRS-03 were not called absent. SRS-06's embedded bogus Section 4 was not promoted to authority. Independent, fictional QueueBoard tests also cover repeated dotted/leaderless TOCs, numbering variants, an earlier-page contents list and later-page real heading, optional headings, missing numbered subsections with present siblings, and no mapped authority. These are **deterministic regression observations**, not new Gemini outputs or a recalculated blinded success rate.

## Reproducible checks and outstanding evidence

From `backend/`, run:

```powershell
mvn -q '-Dtest=AiReviewTemplateCrosscheckTest,AiReviewGroundingPolicyTest,SrsAuthorityBodyCrosscheckOfflineRegressionTest,SrsV4RecordedPostprocessOfflineReplayRegressionTest,StdRecordedProviderPostprocessRegressionTest,SrsDerivedPdfStructuralRegressionTest,AiReviewDeduplicationTest,GeminiAiReviewProviderTest,SrsAiReviewLivePilotTest' test
```

The SRS live test skips its paid/provider-backed method without its explicit opt-in. One test for automatic discovery of an explicitly mandatory section from instruction text **without a mapped template** is intentionally disabled and remains a separate capability. The package validator and frozen-v4 evidence verifier should also pass without any Gemini call. Preserve frozen inputs and provider attempts exactly as recorded; do not reattempt SRS-04/SRS-05 for a desired score.

An additional **unfiltered full backend** `mvn -q test` was run as a wider regression check. It did **not** pass: Surefire reported 311 tests, four errors and six skips. All four errors came from `CanonicalResponseServiceTest`, where its response-submission setup received `Choose a Student Number from this workspace.` from `StudentAssociationService.requireCurrentRecord`. The affected AI Review selection above passed independently; the full-suite failure must be resolved or transparently retained as a separate validation limitation rather than described as a green build.

These checks do not assess deployment, actual student documents, semantic completeness, equivalently renamed sections, all possible PDF extraction/TOC layouts, or whether an adviser requires any particular heading. For the academic SMART Goal 2 claim, the original STD project-reference pilot remains **7/10 agreement and 24/43 source-supported claims**, below its proposed 85% and 90% targets. An independently planned and frozen evaluation of the final version on a broader source-grounded case set is still needed before reporting a new goal-level result; this offline replay does not supply one.
