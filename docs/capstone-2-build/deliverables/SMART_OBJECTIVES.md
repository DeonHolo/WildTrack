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

## Objective 3 - Student interpretation of submission status and next action

**SMART objective.** By the close of the MVP evaluation round, at least 90% of eligible participating students will correctly answer at least 4 of 5 standardized, self-contained WildTrack submission-status/next-action scenarios using the frozen researcher answer key.

**GQM framing.** Analyze student scenario responses for the purpose of evaluation, with respect to correct interpretation of status and immediate next action, from the viewpoint of participating students and the researchers, in the MVP validation questionnaire.

**Measurement unit and denominator.**

- Each of S5-S9 is scored 1 only when the selected option matches the frozen key for the status and immediate next action described by that scenario, otherwise 0. There is no partial credit.
- STU_TOTAL = S5 + S6 + S7 + S8 + S9, range 0-5.
- N_student_eligible includes unique consenting respondents routed as Student who provide the required duplicate-control code and all five scorable answers. Decliners, unusable duplicates, no-use exits, and incomplete scored sections are excluded rather than imputed.
- N_student_pass is the eligible students with STU_TOTAL >= 4.
- The observed pass percentage is 100 * N_student_pass / N_student_eligible.
- The minimum pass count required by the 90% rule is ceil(0.90 * N_student_eligible). For example, 27 eligible students require 25 passes and 28 eligible students require 26 passes.

**Scope and evidence.** The five scenarios are fictional but are grounded in current verified behavior: a saved response is shown to the student as Submitted until a separate acceptance exists; Document Check is a separate advisory result; adviser feedback can request revision without acceptance; acceptance is a separate staff action tied to the current saved version; and archive history is retained separately from the active record. Actual-use students and scenario-only students are reported as separate subgroups.

**Threshold rationale.** The 90% and 4-of-5 values were explicitly selected by the owner for Objective 3. This target is not adviser-approved and does not claim measured usability, satisfaction, or speed.

## Planned sample, endpoint, and exclusions

The course validation plan requires at least 30 unique consenting stakeholder participants across varied roles. The working composition is approximately 27-28 students, 1-2 advisers, and one Admin/beneficiary. This is a planned minimum, not a completed sample or a claim of population representativeness.

The evaluation endpoint is the close of the MVP evaluation round after the questionnaire, routing, answer key, codebook, and technical manifests have been frozen; duplicate and consent rules have been applied; eligible student scenarios have been scored; and technical benchmark logs have been preserved. Sir Ralph Laviste's September 14 consultation transcript remains one real qualitative consultation source and is never inserted as a fabricated questionnaire row.

Decliners do not count as participants. Advisers and Admin/beneficiaries do not enter the student Objective 3 denominator. Required route-specific qualitative prompts may accept "None" when a participant has nothing to add. No observed completion-time measure is required for any objective.
