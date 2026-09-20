# Scoring and codebook

**Status:** freeze this codebook and the Objective 3 task protocol before real collection. It defines proposed scoring/cleaning rules and contains no participant or benchmark results.

## Evidence streams

Keep three evidence streams separate:

1. **Controlled technical benchmark:** Document Check and AI Review fixtures.
2. **Controlled student task:** Objective 3 student submission transaction correctness.
3. **Google Form questionnaire:** descriptive role-based MVP feedback only.

Questionnaire ratings never substitute for technical accuracy or Objective 3 transaction correctness.

## Consent and role codes

These are researcher/export codes only. Do not show them in respondent-facing question titles.

| Code | Meaning | Treatment |
|---|---|---|
| CONS_Y | consented | may contribute eligible evidence |
| CONS_N | declined | exclude from all participant/research denominators |
| ROLE_STU | Student | student feedback; may contribute Objective 3 task evidence |
| ROLE_ADV | Adviser | adviser feedback only |
| ROLE_ADM | Admin/beneficiary | Admin/beneficiary feedback only |
| ROLE_NONE | insufficient current-use/review context | no-use exit |
| BASIS_TASK | student completed/attempted controlled task | intended Objective 3 participant group |
| BASIS_USE | student feedback from other current WildTrack use | questionnaire feedback only |
| BASIS_NONE | insufficient current-use context | no-use exit |

## Objective 3 - Student submission transaction correctness

Objective 3 is **not scored from questionnaire answers**. Its primary evidence is the frozen researcher task record plus WildTrack system/readback evidence from the current imported MVP Validation workspace.

### Controlled task protocol

Each eligible participating student is scheduled for two scored transaction tasks:

1. **T1 - Initial submission**
   - Follow the frozen validation-form instructions.
   - Open the existing **Refactored SRS** submission form.
   - First attempt the pre-specified incomplete/invalid state by leaving the required PDF-link field incomplete/blank.
   - Confirm WildTrack blocks that invalid attempt without creating an incorrect saved response.
   - Paste the Google Drive link to the participant's own existing Refactored SRS PDF.
   - Set **Validation step** to **Initial submission** and submit. This is a link-field workflow, not a file upload.
   - Verify the resulting record and student-visible state.

2. **T2 - Material revision**
   - Reopen the same saved response.
   - Change only **Validation step** from **Initial submission** to **Revised submission**.
   - Do not change the Refactored SRS PDF link.
   - Save the revision.
   - Verify the intended change, unchanged-value preservation, response identity, revision behavior, and student-visible state.
   - The previous Document Check may become marked outdated after the response revision because its report is tied to the earlier response revision. Treat that visible state as expected unless the check has already refreshed; Objective 3 scores whether the displayed state matches the stored/current system state, not whether the old check remains current after any edit.

The task is untimed. The researcher may explain the frozen task instructions but must not click, type, or submit on the student's behalf.

### Researcher task-log fields

The raw task log is access controlled. Use a researcher-created observation ID in the cleaned analysis. Do not ask the participant to type a code into the questionnaire.

| Field | Meaning |
|---|---|
| task_observation_id | researcher-created sequential/pseudonymous task ID |
| consent_confirmed | consent recorded before task evidence is scored |
| canonical_student_key_raw | Student Number or internal record key used only in the restricted raw log to verify unique identity/association |
| workspace_id | current imported MVP Validation workspace |
| target_deliverable | Refactored SRS |
| deliverable_id | frozen validation deliverable |
| task_protocol_version | frozen task-script version |
| t1_started | initial-submission task began |
| t1_required_rule_blocked | prescribed invalid/incomplete attempt was correctly rejected |
| t1_no_incorrect_persist | rejected attempt did not create/overwrite an incorrect response |
| t1_association_correct | valid response stored under correct student/workspace/deliverable |
| t1_values_correct | prescribed submitted values/artifact references persisted correctly |
| t1_visible_state_correct | student-visible state/readback matched the current stored response |
| t1_pass | all applicable T1 assertions passed |
| t2_started | material-revision task began |
| t2_association_correct | revision remained on the same student/workspace/deliverable response |
| t2_changed_value_correct | designated value changed to the prescribed revision value |
| t2_unchanged_values_preserved | all non-designated values remained unchanged |
| t2_revision_correct | saved revision/version behavior matched the frozen expectation |
| t2_visible_state_correct | student-visible state/readback matched the revised stored response |
| t2_pass | all applicable T2 assertions passed |
| task_execution_error | runtime/network/server failure that affected scoring |
| withdrawal_or_nonresearch_stop | participant stopped for a non-system reason |
| evidence_reference | screenshot/log/response ID or other traceable evidence location |
| researcher_note | concise adjudication note |

### Transaction pass rules

**T1_PASS = 1** only when every applicable frozen T1 assertion is correct:

- required/input artifact rule is enforced for the prescribed invalid attempt;
- no incorrect response is persisted by that rejected attempt;
- the valid response is associated with the correct student/workspace/deliverable;
- prescribed values are persisted correctly; and
- the student-visible state/readback matches the current stored response.

Otherwise T1_PASS = 0.

**T2_PASS = 1** only when every applicable frozen T2 assertion is correct:

- the revision remains attached to the same response identity;
- the designated value changes correctly;
- all non-designated values are preserved;
- revision/version behavior matches the frozen expected result; and
- the student-visible state/readback matches the revised stored response.

Otherwise T2_PASS = 0.

### Objective 3 denominator and threshold

Let **N_STU_TXN** be the number of frozen scored transaction tasks that enter the controlled protocol.

- Normally each eligible student contributes two scheduled tasks: T1 and T2.
- A WildTrack failure that prevents a started task from completing remains in N_STU_TXN and is not counted as correct.
- If T1 fails because of WildTrack and that failure makes T2 impossible, record T2 as blocked by the prior system failure; it remains in N_STU_TXN and is not counted as correct rather than silently reducing the denominator.
- A participant who withdraws or stops for a non-system reason before a transaction begins does not contribute that unstarted transaction; report the withdrawal count separately.
- Do not remove an application/runtime failure from the denominator merely because no successful save exists.

Let **C_STU_TXN** be the number of scored transaction tasks with PASS = 1.

**STU_TXN_accuracy = C_STU_TXN / N_STU_TXN**

The current proposed Objective 3 working target is:

**STU_TXN_accuracy >= 0.95**

If N_STU_TXN = 0, report the metric as not estimable.

Also report:

- number of unique eligible student participants;
- number and percentage whose two scheduled tasks both passed;
- assertion-level pass/fail counts;
- runtime/system failures;
- withdrawals/non-research stops; and
- failure categories with evidence references.

Do not reinterpret questionnaire clarity ratings as transaction correctness.

### Repeated student task sessions

The restricted raw task log may use the canonical student record to detect repeated protocols. For a duplicate/repeat:

1. Keep the earliest complete protocol by default.
2. If an earlier run was invalidated by a documented researcher/setup error before meaningful scoring, a pre-authorized repeat may replace it; retain both records and the reason.
3. Never select the better-scoring attempt merely because it improves the result.
4. Do not expose Student Numbers in public analysis tables.

## Questionnaire codebook

The questionnaire is descriptive/supporting evidence. Internal variable names may be used in the cleaned analysis Sheet, but they must not appear as question labels in the live form.

| Internal variable | Meaning | Requiredness / treatment |
|---|---|---|
| consent_code | consent | required |
| role_code | Student / Adviser / Admin / no-use | required after consent |
| student_basis | controlled task / other current use / insufficient use | Student route |
| student_status_clarity | 1-5 linear scale | required Student feedback after current workflow use |
| student_save_clarity | 1-5 linear scale | required Student feedback after submit/edit workflow use |
| student_improvement_raw | selected current student-workflow areas | optional |
| student_comment_redacted | optional student comment | optional; blank is valid |
| adviser_basis | enough current-use/review context | required Adviser route |
| adviser_exposure_raw | adviser features actually used/reviewed | required if Adviser basis is Yes |
| adviser_clarity | 1-5 | required adviser feedback |
| adviser_improvement_raw | selected adviser task areas | optional |
| adviser_comment_redacted | optional adviser comment | optional; blank is valid |
| admin_basis | enough current-use/review context | required Admin route |
| admin_exposure_raw | Admin/beneficiary features actually used/reviewed | required if Admin basis is Yes |
| admin_clarity | 1-5 | required Admin feedback |
| admin_improvement_raw | selected Admin task areas | optional |
| admin_comment_redacted | optional Admin comment | optional; blank is valid |

## Questionnaire duplicate handling

The live form should prefer Google Forms **Limit to 1 response** with **Collect email addresses** off when participant Google sign-in is acceptable. Google currently documents that Limit to 1 response requires sign-in, while usernames are not recorded unless email collection is enabled: https://support.google.com/docs/answer/2839588

Under that configuration:

- do not ask for a self-created participant code;
- do not add name, Student Number, email, or username to the questionnaire;
- the one-response control supports survey-row uniqueness but does not become Objective 3 evidence.

If Limit to 1 response cannot be used:

- assign a generated survey_row_id after export;
- preserve raw timestamps;
- flag obvious repeated rows conservatively;
- do not invent identity from similar answers;
- report that unique questionnaire respondents could not be fully verified; and
- use the controlled task log, not the questionnaire, for Objective 3 participant uniqueness.

## Objective 1 technical denominator

Technical checker evidence comes from the frozen benchmark manifest, not the Google Form.

Goal 1's expected classifications are **researcher/project-defined, source-grounded and AI-assisted**, without mandatory independent human review or any claim of independently established ground truth. The 25-family/30-condition synthetic benchmark schedules 52 technical binary assertions. A separately timestamped reference freeze must precede its designated scored run; the earlier development 52/52 agreement is not a blinded or prospectively frozen outcome. PDF extraction/template comparison with disclosed simulated Drive gateway branches provides component-level evidence, not full real-provider end-to-end accuracy. Do not treat the component score alone as attainment of the proposed end-to-end 90% target.

For Document Check:

- N_DC = all applicable scheduled atomic assertions with project-defined, source-grounded **expected classifications** frozen before the designated run across the 25 STD case families and their documented variants; the reference is not independently validated ground truth.
- C_DC = assertions whose observed classification matches the expected classification.
- DC_accuracy = C_DC / N_DC.
- A run-time or access failure that prevents a scheduled classification remains in N_DC and does not count as correct.
- N_DC_completed counts assertions that produced a classification. DC_coverage = N_DC_completed / N_DC.
- For binary flags where positive/negative labels are meaningful, compute TP, TN, FP, FN, precision, recall, false-positive rate, and false-negative rate. A metric with a zero denominator is not estimable.
- Keep per-assertion expected label, observed label/evidence, result, execution error, fixture hash, app version, and notes.

Do not collapse technical access/readability checks and content/template indicators into one unlabeled confusion matrix if their labels mean different things.

## Objective 2 technical denominator

The proposed AI pilot has ten planned **synthetic STD** fixture attempts: STD-01, STD-02, STD-03, STD-05, STD-08, STD-09, STD-10, STD-12, STD-18, and STD-21. Its comparison standard is a **researcher/project-defined, PDF-grounded reference checklist** prepared through AI-assisted review of the actual extracted PDF source texts and supplied authority, with eleven decisions, evidence excerpts and rationales recorded in `ai-checklist.csv`. No user-performed manual PDF audit or independent human reviewer is claimed. The prepared reference is **not independently validated ground truth**; its dated run-level freeze fingerprint must precede official provider observations. Goal 1 likewise uses a project-defined source-backed reference rather than mandatory human label verification.

The official pilot runner exercises the provider-backed **AI Review component** (`GeminiAiReviewProvider.review` with `AiReviewService.SYSTEM_INSTRUCTION` and the configured model/format), **not** the full deployed Admin/Drive/cache/UI path or `AiReviewService.groundAndValidate` post-filter. Label denominators and report-claim evidence describe this component and cannot be extrapolated to full production end-to-end behavior.

### Reference preparation and provenance

1. The prepared `ai-checklist.csv` records **eleven** source-grounded project-defined issue-present/absent decisions, with fixture/decision ID, expected decision, `reference_source`, `reference_excerpt`, `reference_rationale`, `reference_method=PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW` and `reference_status=FROZEN_PROJECT_DEFINED`. These fields reflect an AI-assisted project review of actual extracted PDF source texts and applicable instructions/template, **not** independent human verification or a recorded manual user audit. Preserve any uncertainty and source limitation. A contents-page heading does not demonstrate body completion; STD-18 has **no** mapped official template and cannot support a mandatory-template finding.
2. Before seeing the **official ten-fixture provider observations**, preserve the prepared checklist/manifest and their hashes, all ten fixture hashes, template hash, `instructions_sha256`, `protocol_sha256`, app commit/prompt/model configuration, real run-level `frozen_at` timestamp, and any already-known development/smoke exposures. A CSV reference status is not proof of a completed run-level frozen key. A past development smoke output, if any, is not part of the scored ten-case pilot; do not represent the project reference preparation as fully blind to material already seen.
3. Preserve any correction after the freeze as an explicitly dated, versioned post-observation amendment with rationale; do not silently change expected decisions after inspecting a report to improve agreement. An unresolved expectation or unsupported authority must be reported as uncertain/unassessable, not assumed correct.
4. The Goal 2 score is **agreement with the frozen researcher checklist**, not independently established AI accuracy. Do not present it as external validation or a pass rate for actual student STDs.

### Provider and per-claim adjudication

Attempt each of the ten fixtures **once** on the free tier. Record each attempted fixture, real timestamp, app/model/prompt version, fresh/cache state, provider request and raw-report evidence, fixture/template hash, and specific failure reason as applicable. A cache hit is not a fresh provider run. Do not retry, choose the best response, or switch to paid calls to complete coverage. Maintain a separate record of report-judgment uncertainty and any known reviewer exposure.

For **every substantive report claim**, retain a distinct claim ID, verbatim or sufficiently specific report passage and pointer, source kind (`pdf`, `official_template`, `deliverable_instructions`, or `unsupported`), precise source location/excerpt where supported, explanation of the claimed inference and requirement provenance, reviewer type/identity/time, and one of supported, unsupported, or uncertain. Document-grounded observations may report facts; a requirement violation must cite a requirement actually supplied to this AI Review configuration. Count only source-supported claims in C_AI_TRACE; report uncertain/insufficiently evidenced claims separately and do not count them as supported. Record the full-claim inventory check against the exact raw-report hash. The researcher performs the adjudication; AI may assist with locating passages but cannot self-certify its own claims. An empty claim inventory produces a not-estimable traceability rate, never 100%.

Before treating a `score-ai.cjs` output as a valid Goal 2 result, verify that the executed scorer/run-record schema accepts `FROZEN_PROJECT_DEFINED` reference labels and researcher/AI-assisted claim audits **without** relying on Goal 1's `human_label_review` fields or representing them as independent verification. A legacy field or scorer message alone is not evidence that independent review occurred. Do not fabricate reviewer identities/times to bypass a scoring gate.

### Computation and reporting

- N_AI_ATTEMPT = 10.
- N_AI_FRESH_OK = fixture attempts that produce a fresh successful AI Review report. AI_fresh_coverage = N_AI_FRESH_OK / 10.
- N_AI_DEC = adjudicable frozen checklist decisions assessed in fresh successful reports, with unassessable decisions and their reasons separately counted.
- C_AI_DEC = those decisions that match the frozen expected decision.
- `checklist_agreement` = C_AI_DEC / N_AI_DEC (agreement with the researcher-defined reference, **not** independently verified accuracy).
- N_AI_CLAIM = all distinct substantive finding claims emitted by fresh successful reports, including unsupported and uncertain claims.
- C_AI_TRACE = those claims supported by auditable passages in the submitted PDF or exact supplied deliverable-instruction/template authority; document uncertainties and unsupported claims separately.
- AI_claim_traceability = C_AI_TRACE / N_AI_CLAIM.

Cache hits, quota failures, provider/transport failures, invalid responses, and no-report outcomes do not enter N_AI_DEC or N_AI_CLAIM because no fresh report was available to score. They remain in the fixed N_AI_ATTEMPT = 10 coverage denominator and separate outcome counts. If N_AI_DEC or N_AI_CLAIM is zero, its rate is **not estimable**. Report both proposed thresholds (85% agreement and 90% traceability) only with numerators, denominators, case-level evidence, and limitations; neither threshold establishes independent or generalizable AI accuracy.

## Missing-response and route rules

- CONS_N rows stop after the decline section and are excluded from participation counts and all goals.
- ROLE_NONE / insufficient-context rows are no-use exits. They do not enter role-specific feedback summaries.
- Optional checkbox/comment blanks are legitimate blanks, not incomplete responses.
- Do not require or normalize a literal "None" response.
- Adviser rows legitimately have blank student/Admin variables. Admin rows legitimately have blank student/adviser variables.
- A student questionnaire row without a controlled task may still contribute descriptive student feedback but does not create Objective 3 task evidence.

## Qualitative coding

Apply qualitative codes only to role-appropriate optional comments and consultation notes. Suggested first-pass themes:

| Theme | Definition |
|---|---|
| STATUS_LABEL | confusion or clarity about a visible submission/review status |
| NEXT_ACTION | uncertainty or clarity about an available next action |
| REMARKS | adviser feedback behavior |
| DOCUMENT_CHECK | Document Check information or interpretation |
| AI_REVIEW | AI Review information on adviser/Admin routes |
| SUBMIT_EDIT | opening, submitting, editing, or saving a response |
| TEAM_PROGRESS | team submission progress |
| NAVIGATION | difficulty locating a view/action |
| PAIN_POINT | concrete friction not covered by a narrower code |
| DEFECT | reported error or unexpected behavior |
| MISSING_FEATURE | requested missing information/capability |
| RETAIN | positive element explicitly recommended for retention |
| OTHER | relevant content requiring a memo and possible emergent theme |

Where feasible, have two researchers review qualitative text, reconcile disagreements, and record the codebook version. Keep excerpts de-identified.

Sir Ralph Laviste's September 14 consultation transcript remains a separately labeled real qualitative consultation source. It is not converted into a fabricated questionnaire row or Objective 3 task result.

## Integrity rules

Freeze the questionnaire, Objective 3 task script/assertions, technical manifests, and this codebook before collection. If an ambiguity is discovered after collection begins, version the affected instrument/protocol, record the reason, preserve the original scoring, and report any sensitivity analysis separately. Never change a task assertion, duplicate decision, or expected benchmark label merely because the observed score would improve.
