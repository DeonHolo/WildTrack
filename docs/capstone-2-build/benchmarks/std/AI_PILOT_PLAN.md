# STD AI Review pilot plan

**Status:** the ten-case official pilot is planned, not claimed as executed or scored by this document. On 2026-09-19 the local environment lacked `GEMINI_API_KEY`, and no paid fallback/provider call was attempted then; that dated observation does not establish the credential or run status on later dates. The reference-label method is the current researcher-defined plan, not a claim that the original planning protocol or an adviser-approved protocol was identical. Development smoke observations outside these ten cases do not count as pilot results.

## Fresh-run set

The first low-quota pilot remains limited to ten content fixtures from the supplied benchmark plan:

`STD-01`, `STD-02`, `STD-03`, `STD-05`, `STD-08`, `STD-09`, `STD-10`, `STD-12`, `STD-18`, `STD-21`.

The opt-in pilot runner invokes the actual provider-backed component `GeminiAiReviewProvider.review` with `AiReviewService.SYSTEM_INSTRUCTION` and the app's configured model/format. It **does not** exercise the complete deployed Admin/Drive/cache/UI request flow or the private `AiReviewService.groundAndValidate` post-filter. Its outcome is limited to this controlled provider component, not full production end-to-end AI Review accuracy or reliability.

All ten planned pilot PDFs are prepared locally: STD-01 uses the owner-supplied official template, while STD-02, 03, 05, 08, 09, 10, 12, 18 and 21 are synthetic controlled PDFs. These are not student submissions or evidence of actually executed software tests. Inspect the PDFs and freeze fixture hashes and source-grounded expectations **before** seeing the first official pilot provider report; document any known exposure to earlier nonpilot development/smoke reports.

## Reference standard and reviewer role

The **project/researcher-defined reference** consists of eleven expected issue-present/absent decisions prepared by an AI-assisted review of the ten actual extracted PDF source texts and applicable supplied STD deliverable instructions/mapped template. For each decision `ai-checklist.csv` records its expected label, `reference_source`, `reference_excerpt`, `reference_rationale`, `reference_method=PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW` and `reference_status=FROZEN_PROJECT_DEFINED`. The reference has source-backed project rationale, but this is **not a recorded manual user audit or completed independent human verification**; no independent human reviewer is mandatory for Goal 2. The separate dated run-level hash/freeze record has yet to be finalized and must precede the first official provider call. `STD-18` has no official template mapped; a model claim that an unprovided template section is mandatory cannot be supported by that template. The source checklist and case-specific expectations are in `GOAL2_REFERENCE_CHECKLIST.md` and `ai-checklist.csv`.

Preserve and fingerprint the prepared project-defined key/manifest versions and hashes, all ten fixture hashes, official template hash, `instructions_sha256`, `protocol_sha256`, app commit/prompt/model configuration and actual run-level `frozen_at` **before** official provider observations; that fingerprint is not claimed to exist yet. If an expectation remains ambiguous, preserve its uncertainty and decide whether it is adjudicable before observing the provider answer. Never silently relabel an expectation after seeing a result; date and version any amendment and separate it from the original frozen-key analysis. Do not present Goal 2 checklist agreement as independently established AI accuracy or assume an independent reviewer merely because a legacy scorer asks for reviewer fields.

## Run rules

1. Confirm the free-tier Gemini credential is configured without printing the key.
2. Complete the PDF/authority evidence audit and freeze app commit, provider model, prompt/grounding version, official template hash, fixture hashes and researcher-defined expected labels **before examining official provider observations**.
3. Attempt each of the ten fixtures **once on the free tier only**. No retries, best-of-N selection, consistency reruns counted as pilot attempts, or paid fallback.
4. Record cache status. A cached report is not a fresh pilot run.
5. Record provider/quota/transport failures separately and keep them in the end-to-end accounting.
6. Score expected issue/clean **agreement with the frozen researcher reference**, correct-document false alarms, per-claim traceability, unsupported findings, uncertainty and unassessable decisions separately. An automated score does not establish independent validity of the reference or semantic claims.
7. Preserve the existing grounding contract: explicit requirement violations must trace to configured deliverable instructions or the mapped official template. Document-grounded observations may describe document facts but may not invent mandatory requirements.
8. Stop rather than switching to a paid model/service if free quota is unavailable; keep all ten cases in fresh-run coverage accounting and state exactly which were not freshly scored.

## Required run record

For each fresh attempt record:

- fixture id and SHA-256;
- timestamp;
- app commit;
- official template SHA-256;
- provider and model;
- prompt/grounding version;
- fresh versus cache status;
- expected finding(s);
- observed finding(s);
- substantive claim source/provenance;
- **complete** substantive-claim inventory, with a raw-report passage/reference for each claim, source PDF or configured-instruction/template passage/reference where supported, and supported/unsupported/uncertain rationale;
- unsupported and uncertain claim counts and source-limited findings;
- adjudicated present/absent/unassessable checklist decision, with raw-report evidence and researcher identity/type/time;
- provider/quota/transport error if any.

For each fresh report, audit **every** substantive claim, not just selected examples. A mandatory-requirement claim must cite the exact requirement made available to the AI Review, while a document-fact observation can cite the PDF. A claim with missing or inconclusive source evidence is not counted as traceable. If no claims are emitted, traceability is not estimable. Preserve the original raw report and its hash, actual cache/request evidence, an inventory-completeness attestation and case-level uncertainty notes. Do not infer an 85% agreement or 90% traceability result without genuine fresh observations and full evidence adjudication.

**Scorer compatibility:** confirm that the executed `score-ai.cjs` version recognizes the project-defined checklist status, source-evidence fields, complete researcher/AI-assisted claim inventory, and frozen instructions/protocol/fixture hashes **without** treating Goal 1 `human_label_review` values as Goal 2 verification. A legacy gate/message alone cannot prove independent review. Never enter a fictional independent reviewer to satisfy a scorer; Goal 1 retains its separate independent-label requirement.
