# Goal 2 v6: prospectively frozen synthetic STD production-filtered follow-up

**Status:** `PROJECT_SOURCE_AUDIT_COMPLETE`, separate 2026-09-21 follow-up, with one recorded provider HTTP 503. This is not a revised score for the original STD Goal 2 pilot, an independent human-validated accuracy estimate, a live Google Drive/UI study, or a claim about actual student submissions.

## Exact experiment and immutable chronology

The project-created, AI-assisted source reference was established from **ten newly authored fictional** STD PDFs, three distinct case-appropriate instruction inputs, one new synthetic mapped template, and complete PDFBox-extracted source texts. Every predeclared binary label was checked against its PDF and the applicable supplied authority. The separate `REFERENCE.json`, manifest, expected decisions, fixture/PDFBox text hashes, runner/scorer, production app revision and v5 prompt/model/cache fingerprint were frozen **before** the first new Gemini request. The source revision is Git commit `3f71bf4`. The original student's SRS, student data and original STD course template were not used as provider inputs.

The immutable pre-run source key is `frozen-key.json`, created at its own `frozen_at` timestamp. Each case's `attempts/G2-XX/attempt-started.json` is the create-only, pre-network claim. `attempt-result.json` records the actual HTTP response status and single-generation attempt count. Successful cases retain the original HTTP 200 response body, parsed raw report and distinct **production-filtered** result obtained through `AiReviewService.postprocessForBenchmark`. All ten scheduled cases were attempted **once**, serially, with no paid fallback, automatic retry or substituted historical case. `G2-05` received **HTTP 503** and was classified `outcome_unknown`; its one attempt remains in the scheduled denominator and was **not retried**. Its Google error body was not stored.

## Measured result

| Metric | Actual v6 observation | Scope |
| --- | ---: | --- |
| Scheduled/attempted case coverage | 10/10 = 100% | Exactly one claimed run per new case. |
| Fresh successful production-filtered reports | 9/10 = 90% | One HTTP 503, unknown provider generation outcome, not scored as success. |
| Agreement with frozen project-defined issue/clean checklist | 9/9 = 100% | One binary decision for each of the nine fresh FINAL reports; failed case excluded from this conditional agreement denominator but retained in fresh-coverage denominator. |
| Source-supported substantive final claims | 10/11 = 90.9% | All findings, missing-section assertions, summary and actions inventoried and checked against their applicable synthetic sources; one incomplete narrative fragment marked UNASSESSABLE. |
| Unsupported / unassessable final claims | 0 / 1 | The frozen scorer segments the quoted section number `5. Submitted Document Note` mid-title in G2-08's summary. The fragment is counted conservatively as a separate unassessable claim rather than quietly exempted or classified as supported. |

The **previously proposed** 85% checklist-decision agreement and 90% claim-traceability gates are both reached **within this separately defined, synthetic, postprocessed v6 follow-up**. They are conditional on nine successful reports and project-defined, AI-assisted source auditing. This is not independent ground truth or a representative accuracy estimate for students' documents. Real end-to-end Google Drive accessibility, Admin workflow, UI and the authenticity of fictional test outcomes were not measured.

The original v3 STD pilot remains unchanged at **7/10 = 70% checklist agreement**, **24/43 = 55.8% source-supported claims**, and one separate original HTTP 503. The earlier six-case SRS v4 study and offline v5 replay also remain separate; no old provider case was rerun or relabeled. The improved v6 numbers cannot be attributed exclusively to a production change because fixture population, prompt, model behavior and final postprocessing context differ.

## Portable verification

From the repository root, run:

```powershell
node --test docs/capstone-2-build/benchmarks/std-goal2-v6/offline-integrity.test.cjs docs/capstone-2-build/benchmarks/std-goal2-v6/freeze-followup.test.cjs docs/capstone-2-build/benchmarks/std-goal2-v6/score-followup.test.cjs
node docs/capstone-2-build/benchmarks/std-goal2-v6/score-followup.cjs --freeze docs/capstone-2-build/benchmarks/std-goal2-v6/results/goal2-v6-20260921/frozen-key.json --attempts docs/capstone-2-build/benchmarks/std-goal2-v6/results/goal2-v6-20260921/attempts --audits docs/capstone-2-build/benchmarks/std-goal2-v6/results/goal2-v6-20260921/audits
```

The second command rechecks the exact current frozen runner/scorer and source hashes, evidence chronology, response IDs, one-shot HTTP transport, raw and FINAL report SHA-256 values, ten-case coverage, per-claim source evidence, all narrative segments and predeclared case decisions. Its output must match `score.json`. It does not call Gemini or alter the evidence. `audit-followup.cjs` holds the **post-observation project/AI-assisted** rationale for the nine completed reports; these are not pre-run labels and do not purport to establish an independent reviewer. The source cases and original v3/SRS evidence are preserved elsewhere unchanged.
