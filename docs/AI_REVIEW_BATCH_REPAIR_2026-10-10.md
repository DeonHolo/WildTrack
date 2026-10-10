# AI Review batch repair — 10 October 2026

## Verified local implementation checkpoint

GitHub request: https://github.com/DeonHolo/WildTrack/issues/94. Canonical branch is `wildtrack-dev`. The implementation has passed local verification; publication and hosted verification are separate.

Written: V34 batch table; AiReviewBatchStore/Service/Controller; provider-free SHA-256 preparation; scope choice, outdated-file warnings, exact scoped groups, CAS leases, uncertain-retry acknowledgement, planned-key/token guards; frontend API/hook/modal/panel; deliverable report titles. Ordinary batches use the server path. An explicit single completed-review rerun still uses the existing guarded per-document path.

Verification: 604/604 frontend tests passed; production frontend build passed; 50/50 batch lifecycle, exact-byte deduplication and claim-store tests passed; 5/5 Drive gateway tests passed; the actual Spring/H2/browser form-persistence journey passed. Earlier slow runs completed; the final targeted backend runs took approximately 38–78 seconds.

The cancellation regression proves a cancelled leased plan cannot be revived by a late worker. Preparation detects a previously linked review after a submitted URL changes without exposing that report as a current-source saved result. Frontend page tests verify attention/all scope, verified unique counts, uncertain retry acknowledgement, outdated-history warnings, continuation and visible overlap feedback.

STD run `STD-20261010-03` appends eight enhancement records to the existing DOCX and retains the historical 50-case baseline. Local screenshots confirm the 375 px queue and form insertion focus. Native drag input interrupted further in-app verification; automated form, report and batch assertions remain green. These screenshots use local fixtures; they are not hosted acceptance.

The live Drive 503 is still unconfirmed. Local generated PDF sizes are below the default 25 MiB cap. Safe gateway diagnostics now distinguish metadata/download stage, elapsed time, upstream status and cause type; they never log keys, file IDs, URLs, error bodies or messages. Do not claim the cap or sharing caused the incident, or raise it without actual hosted evidence.


## Authorized requests

We requested: a batch scope choice (failed/issue-bearing/missing reviews versus including previously successful reviews); freshness checks against current Document Check/File History; unique review-work counts with total PDF counts shown separately; safe continuation of paused batches; feedback for individual requests overlapping an active batch; batch execution that survives page navigation; deliverable names in report titles; investigation of Drive 503 retrieval failures for SDD/STD; and corresponding new STD test evidence after implementation.

Keep explicit acknowledgement for potentially billable retries/reruns, bounded provider calls, artifact/team/workspace/requirements scoping and historical/inconclusive reports. A failed or unknown provider outcome must not silently trigger another provider request. Opening a saved report must remain read-only. Do not call new Gemini reviews during investigation without the already required cost confirmation.

## Findings so far

- Current batch orchestration is page-local in ReviewPage and calls `runAiReviews(... shouldContinue: isCurrentScope ...)`; navigation can stop remaining work. Individual review claims already live in backend AiReviewService; inspect their guard before adding durable batch state.
- AiReviewDialog currently displays selected artifact count, not a verified count of unique PDF-content/requirements groups. Do not claim different links have identical bytes without a content hash or reliable checksum.
- Local generated PDF sizes: SPMP 832,720 bytes; SDD 4,282,638 bytes; STD 1,439,114 bytes. The reported 503 explicitly occurs before AI Review starts and does not establish a page-count/size rejection. Inspect actual limit and upstream failure classification before increasing limits.
- Existing UI fixes are being verified separately in `FILE_HISTORY_TODAYS_WORK_2026-10-10.md`. Preserve them while implementing this addition.

## Exact next step

Publish the scoped implementation and evidence in a PR to main. After merge/deployment, retest navigation/continuation and the reported SDD/STD retrieval on the hosted service. Use safe Drive diagnostics to identify the actual 503 cause before changing transport limits. No fresh Gemini accuracy result was collected in this work.
