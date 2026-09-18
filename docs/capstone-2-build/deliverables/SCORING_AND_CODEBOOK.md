# Scoring and codebook

**Status:** freeze this codebook before real collection. It defines proposed scoring and cleaning rules and contains no results.

## Consent, role, basis, and duplicate codes

| Code | Meaning | Treatment |
|---|---|---|
| CONS_Y | consented | may continue |
| CONS_N | declined | exclude from all participant and research denominators |
| ROLE_STU | Student | eligible for the five-scenario score when route complete |
| ROLE_ADV | Adviser | adviser feedback only |
| ROLE_ADM | Admin/beneficiary | Admin/beneficiary feedback only |
| ROLE_NONE | no applicable role/use | no-use exit |
| BASIS_USE | current MVP use/review | actual-use subgroup |
| BASIS_SCEN | student scenario-only | scenario-only subgroup |
| BASIS_NONE | insufficient context | no-use exit |
| DUP_UNIQUE | no matching normalized code detected | eligible if other criteria pass |
| DUP_CONFIRMED_REPEAT | duplicate clearly represents a repeated submission | keep one row under rule below |
| DUP_POSSIBLE_COLLISION | same code but identity cannot be established | exclude ambiguous rows from primary counts |
| DUP_EXCLUDE | row removed from primary analysis under duplicate rule | retain in exclusion log |

Normalize participant codes by trimming spaces and converting letters to uppercase. The expected pattern is three letters followed by three digits.

The participant code is a pseudonymous duplicate-control aid, not verified identity. For exact duplicate codes inside the collection window:

1. If the rows are clearly the same respondent repeating the form accidentally, retain the earliest complete consenting row and mark later repeats DUP_EXCLUDE.
2. If a later repeat was explicitly submitted to correct an earlier incomplete row and that correction can be documented without guessing identity, retain the corrected complete row, exclude the replaced row, and record the reason.
3. If two rows share a code but cannot be confidently resolved as the same person, mark them DUP_POSSIBLE_COLLISION and exclude both from primary participant counts. Preserve both raw rows and report the collision count.
4. Never resolve a duplicate by choosing the row with the better score.

Decliners do not answer the participant-code question because consent is isolated in Section 1. Decline rows therefore cannot be de-duplicated by C2, but they are outside all participation denominators anyway.

## Item map and role routing

| Item IDs | Construct / purpose | Response code | Requiredness / route |
|---|---|---|---|
| C1 | consent | CONS_Y / CONS_N | required for everyone |
| C2 | duplicate control | normalized six-character code | required only after consent |
| C3 | role routing | ROLE_STU / ROLE_ADV / ROLE_ADM / ROLE_NONE | required after consent |
| C4_STU | student basis | BASIS_USE / BASIS_SCEN / BASIS_NONE | required on Student route |
| S1-S2 | perceived status and next-action clarity | 1-5 | required only for student actual-use |
| S3 | student improvement areas | multi-select themes | optional actual-use student |
| S4 | student qualitative finding | text / NONE | required actual-use student |
| S5-S9 | Objective 3 correctness | A-D, scored 1/0 | required actual-use and scenario-only students |
| S10 | scenario confidence | 1-5 | required scored student |
| S11 | scenario wording qualitative finding | text / NONE | required scored student |
| C4_ADV | adviser basis | BASIS_USE / BASIS_NONE | required Adviser route |
| A1-A4 | adviser workflow evidence | scope / scale / themes / text | A1, A2, A4 required; A3 optional |
| C4_ADM | Admin/beneficiary basis | BASIS_USE / BASIS_NONE | required Admin route |
| D1-D4 | Admin/beneficiary workflow evidence | scope / scale / themes / text | D1, D2, D4 required; D3 optional |

S1-S4, A1-A4, and D1-D4 support descriptive MVP findings. Their agreement or clarity ratings are not technical checker accuracy and are not Objective 3 correctness scores.

## Researcher-only answer key for S5-S9

Keep this table out of the respondent-facing Google Form, quiz feedback, and pre-submission instructions.

| Item | Correct option | Rationale tied to current behavior |
|---|---|---|
| S5 | A | A successfully saved response is shown to the student as Submitted until a separate acceptance exists. No checker or staff decision is implied. |
| S6 | B | The student submission remains Submitted while Document Check is shown separately. A finding such as File needs attention is advisory and does not create acceptance. |
| S7 | A | Adviser feedback can request a revision while the response is still Submitted and unaccepted. The student should correct the requested content and save the revision. |
| S8 | A | Accepted is a separate staff decision tied to the current saved response version. A Document Check result can coexist with acceptance and does not replace it. |
| S9 | B | Archive history is an immutable historical snapshot. Current work belongs in the active response, and historical archive entries can remain even when later acceptance state changes. |

For each item, SCORE_S5 through SCORE_S9 is 1 only for the keyed option and 0 for any other answered option. There is no partial credit. S10 confidence, clarity scales, and agreement-like responses are never converted into correctness.

STU_TOTAL = SCORE_S5 + SCORE_S6 + SCORE_S7 + SCORE_S8 + SCORE_S9, range 0-5.

STU_PASS = 1 when STU_TOTAL >= 4, otherwise 0.

## Objective 3 denominator and 90% threshold

N_student_eligible includes one unique cleaned row satisfying all of the following:

- CONS_Y
- ROLE_STU
- C4_STU is BASIS_USE or BASIS_SCEN
- valid normalized C2 code
- S5-S9 all answered
- not DUP_EXCLUDE or DUP_POSSIBLE_COLLISION

N_student_pass is the count of eligible rows with STU_PASS = 1.

Goal 3 pass percentage = 100 * N_student_pass / N_student_eligible.

If N_student_eligible = 0, report the percentage as not estimable.

The integer number of students required to satisfy the pre-specified 90% target is:

required_passes = ceil(0.90 * N_student_eligible)

Examples for the planned student range:

| Eligible students N | ceil(0.90*N) required passes |
|---:|---:|
| 27 | 25 |
| 28 | 26 |

Report actual-use and scenario-only results separately before any combined result:

- actual-use: C4_STU = BASIS_USE
- scenario-only: C4_STU = BASIS_SCEN

If both groups are combined for the primary Objective 3 result, label the combined result explicitly and also retain the subgroup counts and pass rates. Do not describe the scenario-only group as observed product use.

## Objective 1 technical denominator

Technical checker evidence comes from the frozen benchmark manifest, not this Google Form.

For Document Check:

- N_DC = all applicable scheduled atomic assertions with frozen ground truth across the 25 STD case families and their documented variants.
- C_DC = assertions whose observed classification matches the expected classification.
- DC_accuracy = C_DC / N_DC.
- A run-time or access failure that prevents a scheduled classification remains in N_DC and does not count as correct.
- N_DC_completed counts assertions that produced a classification. DC_coverage = N_DC_completed / N_DC.
- For binary flags where positive/negative labels are meaningful, compute TP, TN, FP, FN, precision, recall, false-positive rate, and false-negative rate. A metric with a zero denominator is not estimable.
- Keep per-assertion expected label, observed label/evidence, result, execution error, fixture hash, app version, and notes.

Do not collapse technical access/readability checks and content/template indicators into one unlabeled confusion matrix if their labels mean different things. Report category-level results as well as the primary assertion accuracy.

## Objective 2 technical denominator

The frozen AI pilot has ten planned fixture attempts: STD-01, STD-02, STD-03, STD-05, STD-08, STD-09, STD-10, STD-12, STD-18, and STD-21.

- N_AI_ATTEMPT = 10.
- N_AI_FRESH_OK = fixture attempts that produce a fresh successful AI Review report. AI_fresh_coverage = N_AI_FRESH_OK / 10.
- N_AI_DEC = adjudicable expected checklist decisions from fresh successful reports.
- C_AI_DEC = those decisions that match the frozen expected decision.
- AI_decision_agreement = C_AI_DEC / N_AI_DEC.
- N_AI_CLAIM = substantive finding claims emitted by fresh successful reports.
- C_AI_TRACE = those claims traceable to the submitted PDF or an exact supplied deliverable-instruction/template authority.
- AI_claim_traceability = C_AI_TRACE / N_AI_CLAIM.

Cache hits, quota failures, provider failures, invalid responses, and no-report outcomes do not enter N_AI_DEC or N_AI_CLAIM because no fresh report was available to score. They remain visible in the fixed N_AI_ATTEMPT = 10 coverage denominator and in separate outcome counts. Do not replace a quota/error outcome with a paid run or repeated calls merely to improve the metric.

## Missing-response and route rules

- CONS_N rows stop after the decline section and are excluded from participation counts and all goals.
- ROLE_NONE or BASIS_NONE rows are no-use exits. They are not placed into a role-specific outcome denominator.
- Missing S5-S9 makes the student row ineligible for the primary Objective 3 denominator. Do not impute an answer.
- Missing optional checkbox items do not make a row incomplete.
- Required qualitative items permit the literal response "None". Code that as NO_COMMENT, not missing.
- A student scenario-only row legitimately has blank S1-S4 because routing skipped the current-use section.
- Adviser rows legitimately have blank student/Admin fields. Admin rows legitimately have blank student/adviser fields.

## Qualitative coding

Apply qualitative codes only to role-appropriate written responses and consultation notes. Suggested first-pass themes:

| Theme | Definition |
|---|---|
| STATUS_LABEL | confusion or clarity about a submission status label |
| NEXT_ACTION | uncertainty or clarity about what to do next |
| REMARKS | adviser feedback/remark behavior |
| CHECK_ADVISORY | Document Check or AI Review interpreted as advisory or confused with a decision |
| ACCEPTANCE_SEPARATE | acceptance decision and its separation from checks |
| ARCHIVE_HISTORY | archive/current-record distinction |
| NAVIGATION | difficulty locating a view/action |
| PAIN_POINT | concrete friction that does not fit a narrower code |
| DEFECT | reported error or unexpected behavior |
| MISSING_FEATURE | requested missing information or capability |
| RETAIN | positive element explicitly recommended for retention |
| NO_COMMENT | respondent entered None or equivalent |
| OTHER | relevant content requiring a memo and possible emergent theme |

Where feasible, have two researchers independently review qualitative text, reconcile disagreements, and record the codebook version. Keep excerpts de-identified. Add an emergent theme only with a definition and an example rule.

Sir Ralph Laviste's September 14 consultation transcript remains a separately labeled real qualitative consultation source. It is not converted into a Google Form row, participant code, or numeric scenario score.

## Integrity rules

Freeze the routing map, answer key, technical manifests, and this codebook before collection. If an ambiguity is discovered after data collection begins, version the instrument/codebook, record the reason, preserve the original scoring, and report any sensitivity analysis separately. Do not change a key, duplicate decision, or expected benchmark label because the observed score would improve.
