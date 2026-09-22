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

## Tab 3 - Objective 3 Protocol and Objective 3 Task Log (revised, restricted)

**Existing live spreadsheet:** `Form_Responses` remains unchanged. The original `Objective 3 Task Log` and `Objective 3 Protocol` active tabs describe **old T1/T2** and are **NOT** the revised study. The owner requested replacing those two active tabs; the one-time bound script `replace_existing_goal3_tabs.gs` previews and creates hidden **dated historical archive copies** *before* removing the two original active tabs and creating new tabs with the same names. Do not rerun the original Form-creation script or delete real historical task data without an archived copy. This repository has not directly edited the user's live spreadsheet.

The **new `Objective 3 Protocol` tab** describes initial SAVED Refactored SRS record correctness, the limited saved-record denominator, true research-consent/selection rules, post-distribution amendment, required assertions and researcher-only technical checks. It also explains why the old Admin Study `Overall pass` cannot be reused.

The **new `Objective 3 Task Log` tab** is **one genuinely selected initial saved record per eligible consenting student**, with these exact headers: `observation_id`, `observed_at`, `consent_scope_verified`, `consent_evidence_reference`, `student_alias`, `response_id_RESTRICTED`, `cohort_selection`, `first_viewed_phase`, `student_association`, `workspace_match`, `deliverable_match`, `initial_saved_version`, `pdf_link_and_values`, `student_visible_readback`, `derived_initial_result`, `initial_version_evidence_reference`, `system_evidence_reference`, `researcher_note`.

Record `CONFIRMED/PENDING/NOT_AUTHORIZED` consent; `INCLUDED/OUT_OF_SCOPE/PENDING` selection; `PRE_AMENDMENT_SEEN/NEW_POST_AMENDMENT/UNKNOWN` phase; `PASS/FAIL/UNVERIFIED` for each of the **five required primary checks** (student association, workspace, deliverable, original saved version and original stored PDF/values). The `student_visible_readback` column is **supporting observation only** and may be `NOT_OBSERVED`; the primary metric must not force retrospective student screenshots. The derived-result formula yields PASS **only** for five verified PASS checks with confirmed consent and inclusion; FAIL if any required check fails; UNVERIFIED if any required evidence remains unknown; otherwise NOT_IN_COHORT. Never infer an initial version from a current `Revised submission` label with no history. The old T1/T2 `Overall pass` is not a substitute for this new result.

Primary calculation after collection: `INITIAL_SAVED_CORRECTNESS = C_INITIAL / N_INITIAL`, where the denominator includes consent-confirmed, selected records with PASS/FAIL/**UNVERIFIED** status and the numerator includes only verified PASS. Working threshold `>=0.95`, **limited to correctly stored *initial saved* records**, not all failed/abandoned attempts. Preserve actual pre-amendment observations, consent uncertainty, incomplete first-version/readback proof, failure modes and number of uniquely eligible students in the final report; if N=0 report NOT ESTIMABLE. Researcher-controlled invalid-link/DOCX/revision checks belong to a separate technical log, not student results.

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
- Objective 3 C_INITIAL, N_INITIAL, INITIAL_SAVED_CORRECTNESS, FAIL/UNVERIFIED and pre-/post-amendment counts **within the revised, saved-record-only scope**; separately label the archived original T1/T2 protocol and any independent researcher-only technical checks;
- questionnaire counts/distributions by role;
- coded qualitative themes with de-identified examples;
- limitations/exclusions table.

Do not place invented sample values in this tab before real evidence exists.
