# Live AI Review connection investigation

## Scope and evidence

The owner reported a multi-minute live review ending with `PROVIDER_CONNECTION_FAILED` guidance. Attached network responses showing HTTP 200 and `RUNNING`, `reused: true` are saved-status polls, not successful generation results. The frontend has an eight-minute polling budget and does not invent the backend's lost-connection message; the provider's generic `RestClientException` catch generates that code.

The owner explicitly authorized testing in the signed-in Admin browser. One retry of the affected Refactored SRS PDF was confirmed through the app's existing retry dialog. The same record subsequently became Reviewed; its shared report says `Reviewed Oct 9, 2026, 12:22 AM`, `Issues identified`, six supported issues and eight verification notes. This proves one fresh saved report was produced, not that every finding is correct or every later provider call will succeed. No further generation attempts or batch were started.

The browser runtime reconnected before the test's final status was captured, so exact request duration and final raw GET payload were not retained. The saved report and timestamp were verified after reconnecting. Earlier source response timestamps and previous reports must not be mistaken for the new result. The exact cause of the original failure is not known from the supplied RUNNING payload; the deployed version logs only its stage. This branch adds safe diagnostics for later failures.

## Bounded repair

Two focused mock regressions failed on main: an HTTP 200 malformed outer Gemini JSON envelope and an HTTP 200 HTML reply both produced `PROVIDER_CONNECTION_FAILED`. Spring wraps conversion errors as `RestClientException`, which the previous generic catch treated as a lost connection. The classifier now returns `INVALID_RESPONSE` for these conversion errors while preserving nested JDK/socket timeouts as `PROVIDER_TIMEOUT` and actual I/O failures as `PROVIDER_CONNECTION_FAILED`.

The failure log now records stage, elapsed milliseconds, fixed failure code and exception class names. Exception messages, provider bodies, URLs, credentials and document passages remain excluded; public failures retain no cause. One-request mock expectations verify no automatic retry. Model, thinking, schema, transport protocol, timeout configuration, success cache identity and saved-report history are unchanged. This is an error-classification/diagnostic repair, not proof that the original interruption was a malformed response or that provider availability is now guaranteed.

The fresh live report's findings were not adjudicated or used to rescore SMART Goal 2. In particular, its SRS-versus-Refactored-SRS identity observation needs separate accuracy review; successful generation does not establish that it is a supported academic issue.

The original dirty checkout and frozen study artifacts remain untouched. Work branch: `codex/fix-ai-review-connection-timeout`, based on main `04bd9a69214921d4965f9a657c2fd0c1fe2aedf2`. Two pre-existing modified STD fixtures, `.token-optimizer/` and an unrelated untracked `461` file must not be staged. SRS package is complete; SDD remains paused for owner review.

## Verification and handoff

The initial four-test run had two expected failures (the malformed envelope and HTML classifications). The final relevant gate passed: 30 provider tests, 36 service/deduplication tests, one saved-result lifecycle test and two transport-initialization tests; 69 total, zero failures/errors/skips. A socket failure after a partial JSON reply still returns `PROVIDER_CONNECTION_FAILED`, so the converter classifier does not turn this exercised transport failure into an invalid-response error. One-generation mock expectations and redacted-log assertions also pass. `git diff --check` passed. A read-only review found no implementation/redaction issue and identified stale checkpoint wording, now corrected.

Reproduction command from `backend`: `rtk proxy mvn -q "-Dtest=GeminiAiReviewProviderTest,AiReviewDeduplicationTest,AiReviewStoreLifecycleTest,AiReviewTransportInitializationTest" test`. These local regression results are separate from the one successful live retry. A final read-only review of the partial-body regression and complete focused diff found no actionable issue.

Private screenshot proof is stored outside Git under the original checkout's `.scratch/AIReview_Live_Saved_20261009.jpg`; it is not a public study artifact or part of the PR. The screenshot verifies the new saved-report date/outcome, not its accuracy.

Exact next unfinished step: push the focused branch and create a PR to main for the owner to merge. Then record the PR/check results. The new diagnostic fix is not deployed. Do not initiate further provider requests. SRS review remains the next academic deliverable action.
