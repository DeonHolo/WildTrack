# Provider failure investigation

After deployment, open Review, select the affected submission and expand Error details beneath the failed AI Review or Document Check. Gemini details are stored through AiReviewStore.failure_diagnostic_json (V39__durable_ai_review_failure_diagnostics.sql); Drive details are stored in FileCheckResponse.failureDetails. ProviderFailureDetails.jsx renders both.

Confidence: verified by focused tests and responsive browser fixtures; production acceptance still requires the matching backend release and one controlled failed-review retry. Historical Google rejection bodies discarded by earlier releases cannot be reconstructed. This implementation stores bounded structural diagnostics and fixed explanations, not arbitrary provider response text. It changes no Gemini request settings and does not establish the cause of historical HTTP 400 failures.

The replaced SRS and two original Drive PDFs downloaded successfully during hosted rechecks on October 14, without sharing changes. The replaced SRS retained the same MD5 as its earlier failed check. This disproves a persistent inability to retrieve those bytes but does not identify the earlier failure mechanism. A separate metadata 404 in Heroku logs has no file identifier and cannot be attributed to those documents.

Submitted-link notices require a persisted SOURCE_CHANGED history event and use its firstObservedAt for stable dismissal identity (CommandCenterPage.jsx#buildWorkQueue). Successful Document Check does not resolve that notice; dismissal or staff decision does. This contract would need revision if history event identity or dismissal handling changes.
