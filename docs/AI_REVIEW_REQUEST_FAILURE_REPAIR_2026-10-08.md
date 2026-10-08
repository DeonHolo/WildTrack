# AI Review request and Drive failure repair

2026-10-08. Follow-up to PR #85; validation repairs are separate PRs #86 and #87.

## Findings and repair

The production screenshots show two distinct stages: Gemini HTTP 400 after generation starts, and WildTrack HTTP 422 during Drive preflight before Gemini starts. A publicly viewable link does not determine the Drive API project's key/quota status.

PR #85 expanded the model's response schema with nested optional metadata and up to 50 provider verification notes. This is the strongest local correlation with universal 400s, but the exact upstream body was unavailable. Google's [structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output?lang=web) warns that large/deep schemas may be rejected. The cause remains **probable**, not proven by a live request.

Restore a compact, shallow wire schema with the core issue/evidence/authority fields and verified checks. Keep the richer saved-report parser, server-generated verification notes, grounding, physical page evidence and new UI. The provider fingerprint changes to `structured-review-v3-compact`; stored reports retain historical labeling. A recognized schema rejection produces a fixed safe `REQUEST_SCHEMA_REJECTED` label; arbitrary provider bodies, document names and credentials are not exposed. One generation attempt remains the policy.

Drive 403s previously all became inaccessible-file claims even though [Drive documents quota and permission causes for 403](https://developers.google.com/workspace/drive/api/guides/handle-errors). The gateway now distinguishes `FILE_ACCESS`, `CONFIGURATION`, `RATE_LIMIT`, `PROVIDER_UNAVAILABLE` and `UNKNOWN` using status and fixed reason classes. Generic forbidden/unknown errors cannot establish a student sharing fault. Resource-key headers remain supported.

AI preflight returns 422 only for known file access/download restrictions; other Drive failures return 503 with appropriate fixed guidance. No job claim or Gemini request happens after failed preflight. Single, batch and scheduled Document Check propagate the same typed distinction at metadata and download stages. Fixed summaries replace raw upstream messages.

## Verification

The main-based run passed **219 tests**, with **3 skips** across 21 backend suites. Skips are the optional private V6/V7 fixtures and the previously deferred instruction-only heading-parser case. It covers compact request shape, schema/error redaction, no retries, extended legacy parser compatibility, preserved uncertainty/grounding, native PDF headings, cache/lifecycle, Drive key/quota/ACL classification, resource keys and batch/scheduled propagation.

Windows checkout converted two deliberately corrupt/non-PDF fixtures from LF to CRLF, failing their existing frozen hashes. Add `-text` for the frozen STD PDF directory. Restoring only the isolated checkout from the exact Git blobs restored matching hashes; no canonical fixture, manifest, source study or benchmark score changed.

Reproduction, from `backend`:

```powershell
rtk mvn -q "-Dtest=AiReviewGroundingPolicyTest,AiReviewTemplateCrosscheckTest,GeminiAiReviewProviderTest,AiReviewDeduplicationTest,AiReviewMetadataGroundingTest,AiReviewPdfLayoutRegressionTest,AiReviewStoreLifecycleTest,AiReviewTransportInitializationTest,PdfPageEvidenceTest,ValidationStudyControllerTest,InitialSavedRecordAuditServiceTest,SrsAuthorityBodyCrosscheckOfflineRegressionTest,SrsV4RecordedPostprocessOfflineReplayRegressionTest,StdRecordedProviderPostprocessRegressionTest,GoogleDriveApiGatewayTest,FileCheckServiceTest,FileCheckCapturedPdfAuditTest,FileCheckControllerTest,FileCheckBatchDedupTest,DeadlineFileMonitorTest,StdBenchmarkObservationExportContractTest" test
```

## Exact next acceptance step

After the user merges and deployment completes, explicitly review **one** accessible PDF first. If Drive rejects the backend configuration or quota, resolve that project/key setting before trying a batch. If Gemini still returns 400, use the fixed failure category/correlation ID to inspect its server classification. Successful mocked tests do not establish hosted success or new Gemini accuracy. No live/billed request or deployment override was performed.

Keep frozen Goal 1/2 results unchanged. Opening existing reports remains read-only.
