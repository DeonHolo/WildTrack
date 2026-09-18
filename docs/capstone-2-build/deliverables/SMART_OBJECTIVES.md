# SMART objectives and measurement model

**Status:** proposed research design for the WildTrack MVP evaluation round. These targets and the selected framework are not adviser-approved and no result is claimed before the participant responses and technical benchmark runs actually exist.

The measurement structure follows Victor R. Basili's 1992 Goal/Question/Metric (GQM) report, *Software Modeling and Measurement: The Goal/Question/Metric Paradigm*, University of Maryland Technical Report CS-TR-2956 / UMIACS-TR-92-96: https://www.cs.umd.edu/~basili/publications/technical/T78.pdf. GQM is used here as a goal-led measurement design, not as a claim that these questionnaire items form a validated psychometric scale.

## Objective 1 - Document Check accuracy

**SMART objective.** By the close of the MVP evaluation round, run the current WildTrack Document Check against all 25 pre-specified STD benchmark case families in docs/WildTrack_Document_Validation_Test_Plan.md, including the documented split or paired variants, and compare every applicable frozen expected Document Check assertion with the observed output. Achieve a proposed primary end-to-end assertion accuracy of at least 90%, while separately reporting execution coverage, false positives, false negatives, precision, recall where defined, and every unassessable/error outcome.

**GQM framing.** Analyze the Document Check output for the purpose of evaluation, with respect to technical and deterministic classification accuracy, from the viewpoint of the researchers and technical reviewers, in the frozen synthetic STD fixture environment.

**Measurement unit and denominator.**

- Before running the benchmark, create a manifest row for each applicable atomic assertion such as accessible/not accessible, valid PDF/not PDF, readable/not readable, template-like/not template-like, missing required heading/not missing, or another explicitly frozen deterministic expectation.
- Let N_DC be the number of applicable frozen assertions scheduled across the benchmark manifest.
- Let C_DC be the number of those assertions whose observed classification matches the frozen expected classification.
- Primary accuracy is DC_accuracy = C_DC / N_DC. An execution failure that prevents a scheduled assertion from producing a classification remains in N_DC and is not counted as correct.
- Where a binary flag has a meaningful positive/negative label, also report TP, TN, FP, FN, precision TP/(TP+FP), recall TP/(TP+FN), false-positive rate FP/(FP+TN), and false-negative rate FN/(FN+TP). Report a metric as not estimable when its denominator is zero.
- Report execution coverage separately as N_DC_completed / N_DC, plus the exact counts and reasons for inaccessible files, corrupt files, parser failures, Drive/API failures, or other unassessable outcomes.

**Scope and evidence.** This goal uses team-run synthetic technical fixtures. Participant opinions are not part of the accuracy denominator, and participants do not grade PDFs or author benchmark fixtures. The official STD template and supplied STD instructions are the authority for requirement-backed expectations. Generic standards knowledge must not be promoted into an expected requirement that the supplied authority does not contain.

**Threshold rationale.** The 90% threshold is a transparent proposed MVP gate for this first evaluation round. It is not a published standard, adviser-approved target, or achieved result. Keeping execution failures in the primary denominator prevents an apparently strong score produced only by dropping hard cases.

## Objective 2 - AI Review grounded-content screening

**SMART objective.** By the close of the MVP evaluation round, run one fresh AI Review, when the free-tier quota permits, on the frozen ten-fixture pilot identified in the benchmark plan: STD-01, STD-02, STD-03, STD-05, STD-08, STD-09, STD-10, STD-12, STD-18, and STD-21. On fresh successful runs, achieve a proposed checklist-decision agreement of at least 85% and a proposed substantive-claim traceability rate of at least 90%, while separately reporting fresh-run completion coverage, cache hits, quota failures, provider failures, unsupported findings, and adjudication notes. Do not use a paid fallback or automatic repeat loop.

**GQM framing.** Analyze the stored AI Review report for the purpose of evaluation, with respect to grounded content screening and requirement provenance, from the viewpoint of the researchers and authorized technical reviewers, in a frozen low-budget STD pilot.

**Measurement unit and denominator.**

- Freeze the ten pilot fixture IDs, their expected issue/clean decisions, the applicable deliverable instructions/template authority, and the scoring checklist before the first benchmark run.
- Let N_AI_ATTEMPT = 10 planned fixture attempts. Let N_AI_FRESH_OK be the number that complete as fresh provider runs with a review report. Fresh-run coverage is N_AI_FRESH_OK / 10.
- Let N_AI_DEC be the number of adjudicable expected checklist decisions produced by those fresh successful runs, and C_AI_DEC the number matching the frozen expected decision. Decision agreement is C_AI_DEC / N_AI_DEC.
- Let N_AI_CLAIM be the number of substantive finding claims emitted by fresh successful reports that assert a document fact, mismatch, requirement violation, or requested action. Let C_AI_TRACE be the number of those claims traceable to the submitted PDF or an exact supplied deliverable-instruction/template authority. Claim traceability is C_AI_TRACE / N_AI_CLAIM.
- Cache hits, quota failures, provider failures, invalid responses, and runs with no fresh report do not enter the decision-agreement or claim-traceability denominators, because they produced no fresh scored report. They remain in the fixed ten-attempt coverage denominator and must be reported separately rather than silently removed.
- Report any metric as not estimable when its denominator is zero.

**Scope and evidence.** AI Review is advisory. Requirement-backed findings must come from the configured deliverable instructions or official template. A document-only observation may still identify an obvious wrong-deliverable mismatch from the submitted content. General domain knowledge can support a non-binding observation but cannot become a claimed WildTrack requirement without supplied authority.

**Threshold rationale.** The 85% decision-agreement and 90% claim-traceability targets are proposed pilot gates chosen to expose grounding defects while keeping the initial run feasible under the free-tier budget. They are not published standards, adviser-approved thresholds, or achieved results.

## Objective 3 - Student submission transaction correctness

**SMART objective.** By the close of the MVP evaluation round, WildTrack will correctly process at least 95% of the frozen controlled student submission transactions performed by eligible participating students in the current imported MVP Validation workspace. Each participating student contributes two scored transaction tasks: one initial-submission task and one material-revision task. A transaction passes only when every applicable frozen correctness assertion for that task matches the expected result.

**GQM framing.** Analyze the student submission workflow for the purpose of evaluation, with respect to end-to-end transaction correctness, from the viewpoint of participating students and the researchers, in the deployed WildTrack MVP validation workspace.

**Measurement unit and denominator.**

- Each eligible student is scheduled for two scored transaction tasks.
- **Initial-submission task:** verify that a deliberately incomplete attempt is blocked by the configured required-input/artifact rules without creating an incorrect saved response; then verify that the completed valid submission is associated with the correct student/workspace/deliverable, preserves the prescribed values, and produces the expected student-visible submitted state.
- **Material-revision task:** edit one designated response value and save; verify that the intended value changes, unchanged values are preserved, the response remains associated with the same student/workspace/deliverable, the revision advances exactly as expected, and the student-visible state remains consistent with the current stored response.
- Let N_STU_TXN be the number of frozen scored transaction tasks scheduled for eligible students who enter the controlled task protocol. A started task that fails because WildTrack cannot complete or persist the required operation remains in N_STU_TXN and is not counted as correct.
- Let C_STU_TXN be the number of scored transaction tasks for which every applicable frozen assertion matches the expected result.
- Primary transaction correctness is STU_TXN_accuracy = C_STU_TXN / N_STU_TXN.
- Report assertion-level results separately so one failed task does not hide which invariant failed. Also report the number of students whose two transaction tasks both passed.
- A participant withdrawal or non-research interruption before a scored task begins is reported separately and is not silently converted into a system failure.

**Scope and evidence.** Objective 3 is scored from the controlled WildTrack task log plus server/system evidence, not from questionnaire ratings or fictional status scenarios. Students perform the real current submission workflow using the existing published **Refactored SRS** form and paste a Google Drive link to their own existing Refactored SRS PDF. WildTrack does not accept file uploads for this task. Use the existing official SRS template mapping so the normal Document Check comparison is part of the student experience. The form includes one required research-only multiple-choice field named **Validation step** with two choices: **Initial submission** and **Revised submission**. During T2 the student changes only this field; the SRS PDF link stays unchanged. The task is not timed and does not claim usability, satisfaction, learnability, or speed.

**Threshold rationale.** The owner accepted the student submission transaction correctness objective. The 95% transaction-correctness value remains the current proposed working threshold to freeze before collection; it is not a published standard or adviser-approved value. Freeze the Refactored SRS task script, Validation step field/options, expected assertions, scoring rules, and threshold before real collection.

## Planned sample, endpoint, and exclusions

The course validation plan requires at least 30 unique consenting stakeholder participants across varied roles. The working composition is approximately 27-28 students, 1-2 advisers, and one Admin/beneficiary. This is a planned minimum, not a completed sample or a claim of population representativeness.

The evaluation endpoint is the close of the MVP evaluation round after the questionnaire, role routing, Objective 3 student-task protocol, codebook, and technical manifests have been frozen; consent and duplicate rules have been applied; eligible student transaction tasks have been scored; and technical benchmark logs have been preserved. Sir Ralph Laviste's September 14 consultation transcript remains one real qualitative consultation source and is never inserted as a fabricated questionnaire row.

Decliners do not count as participants. Advisers and Admin/beneficiaries do not enter the student Objective 3 transaction denominator. Questionnaire free-text feedback is optional. No observed completion-time measure is required for any objective.
