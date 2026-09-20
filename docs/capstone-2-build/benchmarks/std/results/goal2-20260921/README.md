# SMART Goal 2: actual Gemini STD pilot evidence

**Run date:** 2026-09-21 in the Philippines (2026-09-20 17:42–17:45 UTC). **Evaluation configuration:** project-defined, ChatGPT-assisted source checklist, ten controlled STD documents (the supplied official template plus nine synthetic PDFs), Gemini model `gemini-3.1-flash-lite`, WildTrack `wildtrack-academic-review-v3`, app/provider source commit `ff941de81ae37bb5588a4987462c49ae8bf29611`. The frozen checklist and source-file hashes were recorded at `2026-09-20T17:42:05.313Z`, before the first official pilot request at `2026-09-20T17:42:20.383241300Z`.

## Observed technical results

| Metric | Actual result | Interpretation |
| --- | --- | --- |
| Fresh report coverage | **9/10 = 90%** | Nine single-attempt Gemini generations returned complete provider-backed reports. One fixed case (STD-21) returned HTTP 503 and did not produce a report; it was not retried. |
| Agreement with frozen project-defined reference | **7/10 = 70%** | Nine fresh reports contained ten of the eleven scheduled issue/clean decisions. Seven agreed with their frozen PDF-backed labels. The unavailable STD-21 decision was not inserted into the fresh-report agreement denominator; its failure remains in the fixed ten-attempt coverage denominator. |
| Source-supported substantive claims | **24/43 = 55.8%** | Every fresh report received a complete project/AI-assisted source audit: 24 claims supported by the PDF or supplied instruction/template evidence, **15 unsupported** and **4 unassessable**. All 43 substantive claims, including unassessable ones, remain in the conservative traceability denominator. |

The proposed first-round Goal 2 targets were **at least 85% reference-checklist agreement and 90% claim traceability**. The observed 70% and 55.8% **do not meet those targets**. Do not report that SMART Goal 2 achieved them, round these figures into a passing result, exclude the difficult PDFs from the denominator, or retry STD-21 merely to improve coverage.

### Per-case observations

| Case | Frozen criterion | Report observation | Source-supported claims / total |
| --- | --- | --- | --- |
| STD-01 | Uncompleted official template: present | Detected; falsely treated sample `SchedEase` text as actual project identity | 4/5 |
| STD-02 | Cover personalization without substantive completion: present | Detected; also incorrectly identified five existing headings as missing | 3/8 |
| STD-03 | Unfinished sections **while recognizing completed overview**: present | Disagreed; described the document as entirely placeholders despite populated System Overview | 0/5 |
| STD-05 | Unsupported incompleteness: absent; wrong deliverable: absent | Both disagreed; described the intentionally synthetic controlled STD as an unsuitable real student submission. This highlights that the synthetic-benchmark definition of completion is not proof of actual student testing. | 2/3 |
| STD-08 | Repeated filler: present | Detected | 5/5 |
| STD-09 | Irrelevant body content: present | Detected; broader wording that every section was nonsensical was not supported | 3/5 |
| STD-10 | Marketing-plan body mismatched to STD: present | Detected; some extra requested requirements were unsupported or uncertain | 4/6 |
| STD-12 | Missing Test Approach **body** section: present | Detected despite remaining contents entry; blanket claim all other requirements were satisfied was unassessable | 2/3 |
| STD-18 | Invented mandatory template section: absent, with **no template mapped** | No mandatory template heading invented; suggested action independently assumed an unsupplied evidence requirement | 1/3 |
| STD-21 | Absent actual execution evidence: present | **No score:** the single provider request received HTTP 503; report unavailable, no retry | 0/0 |

## What these numbers do and do not establish

These are **actual one-shot provider-backed AI Review component observations**, not fabricated Gemini outputs or student questionnaire ratings. Each of the nine fresh reports was assessed against the previously frozen, PDF-grounded **project-defined checklist** and had its substantive claims audited with ChatGPT assistance. The audit is **not independently human-verified**, adviser-approved, or externally validated. Case labels, semantic/source judgments and false-positive interpretations should therefore be described as *project-reference agreement and AI-assisted source traceability*, not as independently measured general AI correctness.

The technical runner invokes the production `GeminiAiReviewProvider` with the production `AiReviewService.SYSTEM_INSTRUCTION` and the configured prompt/model settings. It does **not** execute the deployed Admin/Drive/cache/UI pathway or `AiReviewService.groundAndValidate` post-filter. These results are limited to the ten scheduled controlled STD fixtures, not a representative sample of student submissions or all academic documents. A synthetic STD with illustrative results is not evidence that real testing happened.

The reference, its methodology/protocol SHA and the app/prompt revision were frozen before these ten attempts. Source-audit/scorer implementation was subsequently hardened to keep uncertain claims inside the substantive-claim denominator and verify source quotes; it did not alter the frozen expected labels, actual provider calls, or raw outputs. The source audit was performed after the provider responses by design and must not be misrepresented as independent/blinded human adjudication.

## Evidence and reproduction

- `frozen-key.json`: pre-attempt methodology, source commit and checklist/manifest/fixture/template/instructions/protocol fingerprints.
- `ai-run-record.json`: ten scheduled attempt outcomes; exact provider/report SHA-256, frozen reference and each fresh report's complete project/AI-assisted decision and claim audit. STD-21 is preserved as `outcome_unknown` after an observed HTTP 503, not converted into an invented clean or defective report.
- `transport-evidence.json`: actual HTTP status and generation-request count for each case, original private attempt-summary hash and the Google `responseId` when returned. No HTTP request-ID header was supplied in the captured results; the provider response ID is not silently substituted for it.
- `provider-responses/STD-NN.json`: sanitized raw HTTP JSON from the nine actual successful Gemini calls; `reports/STD-NN.json`: their separately parsed structured provider results. All nine saved raw payloads matched the original response bytes (`raw_response_exact=true` in run records), and the package was scanned for the local Gemini credential before saving. No error body or API key is published.
- `source-text/STD-NN.txt`: deterministic PDFBox-extracted text of the ten frozen source PDFs for line/passage audit. The actual frozen PDFs and supplied official template are recorded in the parent benchmark manifest/hash list.
- `ai-score.json`: the scored result derived from the portable `ai-run-record.json`, not from questionnaire opinion or a model-generated score.

From the repository root, reproduce the observed score **without any API key or Gemini requests**:

```powershell
node docs/capstone-2-build/benchmarks/std/score-ai.cjs --record docs/capstone-2-build/benchmarks/std/results/goal2-20260921/ai-run-record.json
node --test docs/capstone-2-build/benchmarks/std/score-benchmark.test.cjs
```

The nonparticipant benchmark, Google Form feedback and Goal 3 real-student transaction evidence are separate research streams. A later prompt/code correction or new provider run is a **new dated experiment** with its own frozen key and denominator, not an overwritten or selectively improved version of these results.
