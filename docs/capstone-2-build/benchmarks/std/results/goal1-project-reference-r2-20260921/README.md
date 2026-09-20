# Goal 1 project-defined technical component evaluation

**Evaluation date:** 2026-09-21, Asia/Manila. **Result scope:** controlled synthetic STD *component* assessment, with openly declared in-memory Google Drive gateway simulations. **Reference method:** project/researcher-defined, PDF/template/explicit-instructions grounded expected classifications prepared with AI assistance. No independent teammate review was required, performed or claimed.

## Frozen source and execution chronology

- Before this successful evaluation, an initial separately preserved frozen-key attempt failed in preflight due to an assertion-CSV versus manifest-CSV schema error; **it produced no observations**. See `../goal1-project-reference-20260921/README.md`. The generic CSV reader was fixed and tested, then committed at `43da9900dfb87d500cc13f5d205f7811d8d4af5b` **before** creating this second reference key. The earlier key and failed attempt were not rewritten.
- `frozen-key.json` locks that commit, the full project-defined expected-label list, all 30 fixture condition SHA-256 values, official template SHA, explicit scenario authority, fixed scorer code and reference protocol at `2026-09-20T19:58:16.064Z` (UTC). `independent_human_review=false`; human reviewer fields remain blank/`PENDING` in the legacy CSV format. The prior 52/52 *development* observation was already known, so the reference is **not** a blind or unseen holdout.
- The actual opt-in exporter ran in `OFFICIAL` project-reference mode on frozen revision `43da990` at `2026-09-20T19:58:27.356887200Z` through `2026-09-20T19:58:29.906519200Z` (UTC), **after** its freeze. It wrote one new, create-only `observations.csv` containing 30 rows over the planned 25 case families. Every recorded observation carries the exact pre-run frozen key's SHA, PDF/template hashes, app commit, timestamp and execution scope. No key, fixture or expected label was altered after observing results.
- `project-reference-score.json` was produced from the new observation file and frozen key. The independent offline replay regression verifies its exact bytes and that the older development CSV cannot be relabeled as this run.

## Actual result and what it proves

| Item | Observed |
| --- | --- |
| Planned families / controlled conditions | 25 / 30 |
| Scheduled project-reference binary classifications | 52 |
| Correct classifications against the project-defined expectations | **52/52 = 100%** |
| Completed classifications / execution coverage | **52/52 = 100%** |
| Failed, unassessable or missing scheduled classifications | 0 |
| Recorded source scope | 26 isolated PDF/template, 2 PDF/template plus gateway mock, 2 gateway mock only |
| Independent human adjudication | **None; not claimed** |
| Real Google Drive permission, provider MIME/metadata, or oversized remote file verified | **No** |
| Complete deployed end-to-end Document Check run | **No** |

The scorer status is exactly **`PROJECT_DEFINED_COMPONENT_RESULT_NOT_END_TO_END_GOAL_1`**. The 52/52 score is technically reproducible agreement with the *project-authored* reference on familiar synthetic inputs. It is **not** independent model/checker accuracy, performance on real student documents, independent holdout performance or evidence of satisfying the originally proposed **end-to-end 90%** SMART Goal 1 target. A passing PDF-integrity assertion does not establish academic completeness, semantic requirement traceability, actual software execution or correct AI Review.

The component benchmark uses actual production `PdfInspector`/`TemplateComparator`; four conditions also exercise `FileCheckService.check` with **simulated**, in-memory `GoogleDriveGateway` metadata or exceptions. STD-16's simulated generic unavailability is not a verified Drive HTTP 403. STD-17-oversized's **small local PDF** is tested with mocked remote metadata size 26,214,401 bytes, above the configured 26,214,400-byte limit, not a truly oversized Drive file. No live Google Drive or Gemini requests were sent. Failures would remain in the 52-assertion denominator; none occurred in this scoped run.

## Reproduce offline without creating new observations

From the repository root:

```powershell
node --test docs/capstone-2-build/benchmarks/std/goal1-project-reference-evidence.test.cjs
node docs/capstone-2-build/benchmarks/std/score-deterministic.cjs --observations docs/capstone-2-build/benchmarks/std/results/goal1-project-reference-r2-20260921/observations.csv --freeze docs/capstone-2-build/benchmarks/std/results/goal1-project-reference-r2-20260921/frozen-key.json
```

The first command verifies frozen hashes, source chronology, 30 observations, 52/52 reproducible scoring, explicit absence of a human reviewer, and rejection of attempts to reuse the old development probe as the new result. Neither command modifies the already-published artifacts or calls Google Drive or Gemini.
