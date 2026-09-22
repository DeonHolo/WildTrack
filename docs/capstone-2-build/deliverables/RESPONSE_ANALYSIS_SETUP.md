# Existing Google Form response Sheet - safe analysis setup

**Current owner-confirmed state:** The `WildTrack MVP Evaluation` Google Form is already distributed and has a connected `WildTrack MVP Evaluation - Responses` spreadsheet. The screenshot shows the real source tab `Form_Responses` and at least one submitted row. It does **not** disclose total respondents or establish how many distinct consenting people have answered. We cannot authenticate to or modify that live spreadsheet from the current repository terminal; **no live sheet was edited here**.

## What is ready

`prepare_existing_response_analysis.gs` is a bounded, separately versioned script for the **existing response spreadsheet**. It will create/update only `Questionnaire Analysis` and `Validation Summary`; it does not create another Google Form, change published questions, alter any cell of `Form_Responses`, change or delete the existing `Objective 3 Task Log`, or submit responses. The reviewer-only annotation columns N:P in the derived analysis sheet are preserved on refresh. The summary distinguishes anonymous response rows from proven unique participants and retains Goal 1/2 scopes separately from pending Goal 3.

## When you want to use it

1. In the **existing** response spreadsheet, open **Extensions > Apps Script**. Add the contents of `prepare_existing_response_analysis.gs` as a **new** script file; do not run or rerun `createWildTrackMvpEvaluation()`, `clearWildTrackMvpEvaluationGuard()`, or any Form-creation function.
2. Save, select `previewWildTrackResponseAnalysis` and run. Approve only the normal Apps Script spreadsheet access prompt if it appears. Inspect the execution log for header-mapping errors and provisional route counts. This preview is read-only. If the live Form's question headers differ from the original source draft, adjust only `WILDTRACK_ANALYSIS.QUESTIONS` to the **actual corresponding question text**, rerun preview, and do not guess using column position.
3. Only if preview recognizes all required source headers, run `prepareWildTrackResponseAnalysis`. Verify the two *new derived* tabs appeared and that the original `Form_Responses` tab still contains the same cells, tabs and incoming response stream. It does not auto-poll; rerun manually to include later responses. Stop if either derived tab already exists with unfamiliar headings: the script refuses to overwrite an unrelated sheet.
4. Manually inspect every `NEEDS_REVIEW` row (especially blank or unexpected consent and invalid 1-5 ratings). Resolve eligibility from genuine source evidence without changing a missing consent to Yes. Code improvement themes and review possible duplicate rows only with an explicit rationale; answer similarity alone does not prove duplicate persons.
   Preserve the original Form response-row ordering: a derived annotation is anchored to its raw row/timestamp and the refresh rejects an observed row-timestamp mismatch rather than silently attaching review notes to a different person.
5. Keep the linked Form-response spreadsheet access restricted. Do not copy names, student numbers, Google subjects, raw comments, private PDFs or credentials into any public analysis file or version-controlled repository. For amended Goal 3 use separately consented, eligible and independently verifiable original saved Refactored SRS system records, not survey responses or historical T1/T2 pass flags.

The original `create_wildtrack_mvp_evaluation.gs` (if used to create the Form) may already have added an Objective 3 Task Log/Protocol tab. **This questionnaire-analysis script** deliberately does not inspect or modify those tabs. The **separate, explicitly owner-requested one-time** `replace_existing_goal3_tabs.gs` instead archives and replaces just the two obsolete active Goal 3 tabs in that *same existing* Sheet; see `GOAL3_SHEET_REPLACEMENT_SETUP.md`. Never rerun the original Form-creation script or delete the historical archives. Questionnaire comments remain in the raw source; the derived sheet stores only whether one is present. The form's optional-question behavior is left unchanged during ongoing collection. The older course note mentions mandatory open-ended prompts: resolve this academic interpretation with the adviser when finalizing the instrument documentation rather than disrupting an already distributed survey.

## Analysis boundary and actual status

The current source document `QUESTIONNAIRE.md` is a historical/copy-ready model, **not** a verified export of every live Form question. A Google Form self-reported task-completion item, if present in the live response spreadsheet, is never treated as proof of persisted/refreshed/refactored SRS submissions. The script does not use that item to calculate Goal 3. The existing user screenshot is deliberately **not committed** as evidence because browser tabs and the spreadsheet may show unrelated private material; capture a clean, narrowly cropped, access-controlled export later if needed.

Local offline synthetics for header matching, consent handling, optional comments and read-only preview:

`node --test docs/capstone-2-build/deliverables/prepare_existing_response_analysis.test.cjs`

The script has **not** been run against the owner's live Google Sheets data; its real header mapping and output tabs must be checked with the preview above.
