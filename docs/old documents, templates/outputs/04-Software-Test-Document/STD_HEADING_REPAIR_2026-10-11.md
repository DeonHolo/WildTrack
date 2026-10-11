# Document Check heading repair — 11 October 2026

We reproduced the reported heading issue using the actual `STD TEMPLATE.docx`, `WildTrack_STD.docx`, and 58-page `WildTrack_STD.pdf` through the production text extraction and comparison classes. No document was changed and no AI request was sent.

The template's Word table of contents extracts as `1. Introduction 4`, `2. Test Plan 5`, and `3. Test Cases 6`. The last numbers are page references. Word identifies headings from document styles; WildTrack compares extracted text. The old comparator recognized only dotted-leader contents entries, so it mistakenly required the page numbers as part of those heading names. It reported all three absent despite finding their actual body text in the PDF.

The repair recognizes plain/tabbed contents entries within the contents section, removes only their page references, and excludes those entries from body evidence. Literal numbers in real heading names remain significant. Placeholder branches such as `Case-n`, `Test n`, and `Module 1` do not become fixed required sections.

| Actual local PDF result | Before | After |
| --- | --- | --- |
| Introduction, Test Plan, Test Cases | 0 of 3 detected | All detected on physical pages 8, 10, and 12 |
| Full useful template structure | Only 3 malformed titles selected | 11 of 12 headings detected |

The remaining title difference is genuine: the template says **Test Results**, while our document uses **A.2. Execution Summary**. The comparator preserves this naming difference; it does not conclude that the underlying results are missing. The DOCX and PDF remain frozen as requested.

The new authenticated, workspace-scoped template structure endpoint returns readable text and the expected/detected headings on explicit preview. The template list stays compact. Existing saved Document Check reports retain their original results until a new check runs.

Verification: 26 focused tests passed, including the actual artifact audit, DOCX-to-PDF extraction, contents-only and missing-body controls, template preview authentication/scope, and durable storage. A separate 39-test impact suite passed across file checking, deduplication, submission substance, and AI template cross-checking. These are local tests, not hosted deployment or live Gemini accuracy evidence.

Evidence is in `evidence/STD-20261011-heading-audit/`: `before.json`, `after.json`, extracted template text, and focused/impact JUnit reports and run metadata. Original SHA-256 hashes match before and after:

| File | SHA-256 |
| --- | --- |
| STD TEMPLATE.docx | `4d82811883b9181d67be7099f37c880583b5ba9e5d34816c3160b673e4cc2d82` |
| WildTrack_STD.docx | `309012f9ba4a941542e31e805034badae319154f5c5858096cef57f93ed728a1` |
| WildTrack_STD.pdf | `eabafc7835868f95fb967bf67fb7c6ab68a5d6380edf65f43c4a43dbf3f2c4e1` |
