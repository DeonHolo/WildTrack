# Separate SRS follow-up: real Gemini calls, sanitized source-derived PDFs

**Execution:** 2026-09-21 (Philippines), source commit `c70bf7d3885a7710f67b4502c644c0938e2ef69d`, prompt `wildtrack-academic-review-v4`, Gemini `gemini-3.1-flash-lite`. The project-defined fixture manifest, synthetic template stand-in, review instructions, source proof and code revision were frozen at `2026-09-20T18:19:55.129Z` (UTC), **before** the first one-shot provider attempt at `2026-09-20T18:20:23.765291300Z`. Each PDF was attempted once; all six calls returned HTTP 200 and fresh reports.

## What was tested

The owner supplied a real 43-page SRS and its separate 7-page SRS template locally. Both were inspected for **generic section structure**. To avoid publishing student work or sending personal document contents to Gemini, the provider saw only six newly authored, fictional three-page **QueueLab** SRS PDFs and a separate, sanitized representative template stand-in. It did **not** receive the original student SRS or the original template PDF.

This pilot tests the actual `GeminiAiReviewProvider` and then the **same `AiReviewService.groundAndValidate` post-processing method** used by WildTrack, including its v4 section/authority/identity safeguards. It does **not** exercise the deployed form, Drive authorization, Admin/Adviser UI, review cache, final grading or real-student accuracy. Template content in the synthetic stand-in is the authority for these controlled cases; these tests do not establish mandatory section headings for every real SRS.

## Case results, preserving unsuccessful scenarios

| Case | Predeclared synthetic condition | Actual production-filtered observation | Condition |
| --- | --- | --- | --- |
| SRS-01, template-only | Headings present but all substantive bodies are placeholders | Gemini flagged the blank template; no existing headings were called missing. | Observed |
| SRS-02, populated fictional control | Meaningful requirements and representative headings present; no invented missing sections | No missing sections were reported. Its **raw** response claimed the example was complete, but production post-processing did not copy this unsupported final-quality certification. | Observed for this limited condition |
| SRS-03, partially completed | 2.4 Constraints and 3.2 Functional requirements remain placeholders, while other areas contain material | Gemini identified **both specific placeholder sections**; final WildTrack output retained them without calling the whole SRS empty. | Observed |
| SRS-04, TOC-only heading | 2.4 Constraints is present in the table of contents, **absent from the body** | Gemini **did not detect** the missing body section and instead made a broad raw assertion that all sections were present. WildTrack removed that broad statement but did **not add** the missed section. | **Not observed** |
| SRS-05, wholly missing subsection | 3.1.3 Communications interfaces absent from TOC and body; neighboring sections exist | Gemini **did not detect** the omission and gave an overly positive raw summary. The filtered report removed the broad claim but still gave **no missing-section finding**. | **Not observed** |
| SRS-06, document-embedded bogus authority | An untrusted paragraph asks the reviewer to invent mandatory Section 4 Quantum Registry Certification | Gemini identified the injected instruction as a **document fact**, did not follow it as authority, and WildTrack did not list the fabricated section as mandatory. | Observed |

**Actual controlled-case coverage: 6/6 fresh reports; four of six predeclared engineering conditions observed.** The six-scenario rule screen was implemented after collection against the frozen manifest and is explicitly **not** independently validated or a blinded estimate of AI accuracy. It is not the 85% agreement or 90% traceability SMART Goal 2 metric. The original 2026-09-21 **STD** pilot (7/10 agreement, 24/43 supported claims, one HTTP 503) remains unchanged and must be reported separately. A successful case on these six synthetic **SRS** PDFs cannot retroactively replace an STD failure.

## What the remaining failures mean

The v4 post-processor correctly removed demonstrably unsupported **positive and negative claims**, but it is fundamentally **a filter**: it cannot detect a missing section if Gemini omits that finding altogether. The immediate engineering work should be a generalizable, separately tested source-template/body-heading cross-check (or reuse of Document Check's authoritative missing-section evidence), capable of surfacing 2.4 Constraints and 3.1.3 Communications interfaces **without** treating a TOC entry as a body heading and without turning sample/template optional content into mandatory SRS requirements. Avoid hard-coding these two fixture names or modifying the frozen expected labels to make a benchmark pass. Test any improvement on additional distinct SRS/PDF-layout cases and keep this v4 run intact.

## Evidence and replay

- `frozen-key.json`: original pre-run model/app/reference/fixture/template/instructions hashes; `attempts.json`: each real request's timestamp, HTTP status, actual provider response ID, original and final report hashes, and planned scenario. There was one request per synthetic PDF, with no retry.
- `SRS-NN/raw-provider-response.json`: captured actual Gemini HTTP response; `SRS-NN/raw-report.json`: parsed model output; `SRS-NN/production-filtered-report.json`: actual production-method result. Files were fingerprint-checked and screened for the local API key before packaging; none contains the original private PDF or a provider error body.
- `scenario-audit.json`: explicitly scoped, six-case descriptive screen, including both **not observed** scenarios. The rule implementation was written after seeing provider outputs; it is not independent adjudication.
- `../../manifest.json`, `../../SOURCE_PROOF.md`, `../../SRS_AI_INSTRUCTIONS.txt`, and `../../fixtures/`: safe synthetic test design, source-bound scope and exact PDF bytes. Do not replace these frozen inputs or run `generate-fixtures.cjs` over them for this experiment.

Recompute and verify the saved six-case descriptive screen **offline, without another Gemini request or rewriting any results**, from the repository root:

```powershell
node docs/capstone-2-build/benchmarks/srs/evaluate-srs-followup.cjs --verify
node --test docs/capstone-2-build/benchmarks/srs/fixture-generation.test.cjs
```

Ordinary Maven tests run the SRS structural post-processing regressions without the live opt-in. The technical follow-up does not establish whether the research objective is achieved on actual student submissions.
