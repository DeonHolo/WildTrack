# Validation response and analysis sheet schema

**Status:** the actual Google Form and its connected response spreadsheet already exist; the owner's screenshot shows a `Form_Responses` tab with at least one row. This repository file is a **schema**, not a live export or verified respondent count. Keep the actual Google Forms response tab raw and create analysis tabs separately; `prepare_existing_response_analysis.gs` prepares derived sheets in the existing spreadsheet after a read-only preview.

## Tab 1 - Google Form Responses (raw)

Owned by Google Forms. The real connected tab is named `Form_Responses`. Do not manually rewrite, sort in place, or add research scoring formulas to this tab during collection.

Expected questionnaire fields are defined in `QUESTIONNAIRE.md`. Preferred settings keep email collection off and do not use a respondent-created participant code.

## Tab 2 - Questionnaire Analysis

One row per submitted questionnaire response.

| Column | Purpose |
|---|---|
| response_timestamp | source response timestamp |
| survey_row_id | researcher-created stable analysis key |
| consent_code | consent/decline route |
| role_code | student, adviser, admin, no-use |
| student_basis | student exposure route |
| student_status_clarity | student feedback rating |
| student_save_clarity | student feedback rating |
| student_improvement_raw | original free-text improvement response |
| student_improvement_themes | coded theme(s), never overwrite raw text |
| student_comment_redacted | de-identified optional comment |
| adviser_basis | adviser exposure route |
| adviser_exposure_raw | selected adviser feature exposure |
| adviser_clarity | adviser feedback rating |
| adviser_improvement_raw | original adviser improvement response |
| adviser_improvement_themes | coded theme(s) |
| adviser_comment_redacted | de-identified optional comment |
| admin_basis | Admin/beneficiary exposure route |
| admin_exposure_raw | selected Admin feature exposure |
| admin_clarity | Admin feedback rating |
| admin_improvement_raw | original Admin improvement response |
| admin_improvement_themes | coded theme(s) |
| admin_comment_redacted | de-identified optional comment |
| route_complete | whether expected route fields are present |
| survey_duplicate_status | duplicate-review result |
| exclusion_reason | blank unless excluded from a stated analysis |
| qualitative_codes | final cross-role theme codes |
| coder_note | researcher note, not participant data |

Rules:

- Never use questionnaire agreement to score Objective 3.
- Preserve raw text separately from coded themes.
- Report role-specific denominators rather than treating missing branches as zeroes.
- Sir Ralph's September 14 consultation remains qualitative evidence, not a fabricated Google Form row.

## Tab 3 - Objective 3 Task Log (restricted)

One row per scheduled T1 or T2 task.

| Column | Purpose |
|---|---|
| task_observation_id | researcher-created public-safe key |
| raw_student_record_key | restricted canonical Student Number/internal key |
| workspace_id | existing MVP Validation workspace |
| deliverable_id | Refactored SRS form id |
| task_code | T1_INITIAL or T2_REVISED |
| started_at | observation start if recorded; task is not speed-scored |
| completed_at | observation completion if recorded |
| required_blank_attempt_blocked | T1 assertion |
| correct_student_record | persisted response matches intended canonical student |
| correct_workspace | persisted response belongs to expected workspace |
| correct_deliverable | persisted response belongs to Refactored SRS |
| pdf_link_expected | researcher reference to expected submitted link, restricted if needed |
| pdf_link_persisted_correctly | assertion |
| validation_step_expected | Initial submission or Revised submission |
| validation_step_persisted_correctly | assertion |
| response_id_preserved | T2 assertion |
| unchanged_values_preserved | T2 assertion |
| revision_behavior_correct | T2 assertion |
| visible_readback_correct | student-visible result/readback assertion |
| runtime_error | explicit platform/runtime failure if any |
| task_pass | true only when every applicable frozen assertion passes |
| exclusion_or_unassessable_reason | explicit reason; never silently drop |
| evidence_reference | screenshot/log/audit reference, not binary data in this sheet |

Primary calculation after collection:

`STU_TXN_accuracy = count(task_pass = TRUE) / count(scored T1/T2 task rows)`

Working target: `>= 0.95`.

Also report unique eligible students, total scheduled tasks, scored tasks, both-tasks-pass students, assertion-level failures, withdrawals, unassessable cases and runtime errors.

## Tab 4 - Document Check Component Benchmark

One row per frozen fixture/assertion pair or a normalized fixture row plus assertion child table.

Minimum fields: fixture_id, fixture_version/hash, expected finding, observed finding, assertion_type, TP/FP/TN/FN/not-assessable, run timestamp, checker version/commit, template version/hash, execution error, notes. Use the **already recorded 52/52 project-reference component run** and link `GOAL1_SCOPE_AMENDMENT_20260921.md` as a **post-observation** scope clarification. Flag gateway mocks as simulated and do not count optional deployed-MVP screenshots in the 52-assertion denominator or invent new live-Drive results.

## Tab 5 - AI Review Pilot

Minimum fields: fixture_id, fixture version/hash, expected content issue, fresh_or_cache, provider/model, prompt/grounding version, result, traceable_claim_count, unsupported_claim_count, adjudicated decision, provider/quota error, notes.

Cached results are never counted as fresh pilot executions.

## Tab 6 - Summary Tables

Populate only after collection. Suggested outputs:

- Objective 1 component-reference agreement (52/52), coverage (52/52), applicable per-signal FP/FN and its post-benchmark scope clarification;
- Objective 2 decision agreement, traceability and fresh-run coverage;
- Objective 3 C_STU_TXN, N_STU_TXN, STU_TXN_accuracy and both-tasks-pass count;
- questionnaire counts/distributions by role;
- coded qualitative themes with de-identified examples;
- limitations/exclusions table.

Do not place invented sample values in this tab before real evidence exists.
