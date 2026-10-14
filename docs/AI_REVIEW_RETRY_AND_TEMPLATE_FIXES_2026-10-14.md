# AI Review retry, change acknowledgement, and Adviser templates — 2026-10-14

## Reported behavior and resulting changes

An acknowledged **PDF content changed** notice briefly appeared when Document Check opened. Its old first render assumed “not acknowledged” before the account's saved receipt loaded. DocumentChangeNotice now treats that state as unknown and shows the notice only after a successful receipt read. It uses the existing account/workspace resource cache, so a saved acknowledgement is available when reopening the dialog. An unavailable first read shows a retry message rather than an active change warning.

Late acknowledgement reads or saves cannot affect a different account, workspace, document, or a document revisited after switching away. Successful saves invalidate older reads. Acknowledgement still applies only to that recorded content-change event; another PDF change gets a new notice. File History remains intact, and acknowledgement does not accept a submission or refresh AI Review.

Starting a rerun previously advanced `source_verified_at` before Gemini produced a new report. A failed attempt retained the earlier report but incorrectly made it appear current. The receipt now advances atomically with a saved completed report, or when an already completed report is reused for identical verified input. Running, failed, and superseded attempts retain the prior legitimate receipt. Capture time is recorded before downloading the PDF, rather than when a queued review finishes, so a change detected during review can still mark its result outdated.

Migration **V38__repair_failed_ai_review_verification.sql** clears ambiguous receipts associated with unfinished jobs. These fall back to the earlier report's generation date. It preserves completed-report receipts, reports, and file history. Old failed attempts may conservatively show an outdated warning again.

Advisers were redirected from the official-template preview because its frontend route allowed only Administrators. The route now allows Advisers as well. The preview's return link leads Advisers to **My advised teams**. Existing authenticated, workspace-scoped template reads remain in use; template editing remains restricted.

## Gemini HTTP 400 investigation

The production attempt at **2026-10-14 09:12:55 Singapore time** failed at `stage=generation status=400 code=REQUEST_REJECTED detail=http_400`. The submitted PDF passed preparation. The persisted view also showed a newly advanced verification receipt with an older saved report, confirming the freshness bug above.

The user approved a read-only credential check. Google's model-information endpoint returned **HTTP 200** for `models/gemini-3.1-flash-lite` using the deployed key and listed `generateContent` support. This confirms that key/model lookup worked at the time of inspection. It does not prove that the failing generation request was valid, or identify its exact rejection cause. No AI generation was initiated for this investigation.

The old log omitted Google's specific rejection reason. Future HTTP 400 responses now select fixed diagnostic labels for response schema, thinking/generation settings, PDF input, recognized credential failures, and generic invalid-argument/precondition failures. Provider messages, keys, document text, and arbitrary field names are neither retained in these failures nor copied into logs. These labels improve diagnosis; they do not claim to repair the unresolved production 400.

A shell-based validation attempt was rejected by automatic approval review because putting a key in command-line arguments could expose it. Validation instead completed entirely inside the browser, sending the key only to Google's API origin in a request header. The helper tabs were closed and Heroku's config values were hidden afterward.

Primary references: [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Models GET reference](https://ai.google.dev/api/models).

## Verification

- Backend: **93 focused tests passed**, covering store lifecycle, real service persistence/deduplication, failed-rerun receipts, capture time, migration repair, and sanitized provider errors. These use local databases and simulated provider responses.
- Browser: the six existing review/history journeys passed, and all **three new regressions passed**. A DOM observer detects even briefly inserted change notices while the first receipt request is held pending; the acknowledged notice is never inserted. Separate journeys display outdated and failed-rerun notices together and open the official template from an Adviser Document Check.
- Frontend: the full run passed 713 of 715 tests; two page fixtures returned monitoring objects for every resource hook and failed when acknowledgement became a separate resource. Both fixtures were corrected to use the real acknowledgement hook. All **75 tests in those affected page suites then passed**. No production workaround was added for the incorrect fixtures.
- The production frontend build passed.
- Live evidence is limited to the existing failed generation log, the saved review view, and the read-only model lookup. The code changes have not yet been deployed or validated through a new live generation request.

## Implementation anchors

- `frontend/src/components/review/DocumentChangeNotice.jsx`
- `frontend/src/hooks/useWorkspaceResource.js` and `useWorkspaceScope.js`
- `backend/src/main/java/com/capvault/backend/aireview/AiReviewService.java`
- `backend/src/main/java/com/capvault/backend/aireview/AiReviewStore.java`
- `backend/src/main/java/com/capvault/backend/aireview/GeminiAiReviewProvider.java`
- `backend/src/main/resources/db/migration/V38__repair_failed_ai_review_verification.sql`
- `frontend/src/app/App.jsx` and `frontend/src/pages/TemplatePreviewPage.jsx`
- `frontend/tests/browser/review-retry-regressions.spec.js`
