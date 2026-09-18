# Framework and evidence plan

**Status:** proposed evaluation design. It is not adviser-approved, not yet deployed as a hosted instrument, and contains no participant or benchmark results.

## Selected goal-led framework

Use Goal/Question/Metric (GQM) as the measurement-design framework for this MVP evaluation.

Primary source: Victor R. Basili, *Software Modeling and Measurement: The Goal/Question/Metric Paradigm*, University of Maryland Technical Report CS-TR-2956 / UMIACS-TR-92-96, 1992: https://www.cs.umd.edu/~basili/publications/technical/T78.pdf

Basili's report defines measurement from explicit goals, operational questions, and associated metrics, with the object, purpose, quality focus, viewpoint, and environment made explicit. That fits this evaluation because WildTrack has three different evidence types that should not be collapsed into one opinion score: deterministic Document Check outcomes, grounded AI Review outcomes, and student status/next-action interpretation.

GQM is used here to organize what evidence answers each goal. It is not treated as a standardized psychometric questionnaire, and the custom role-feedback items are not claimed to have established reliability or population validity.

## Why GQM fits the current consultation and course constraints

The September 14 consultation said the SMART goals should come first and the framework should follow them. It also separated technical checker/content concerns from ordinary usability and said SUS should not count as one of the three minimum SMART goals. The course instructions require the validation instrument to map to project SMART objectives and a selected research/evaluation framework. GQM directly provides that goal-to-question-to-metric trace.

The course notes also state that the selected framework requires technical-adviser endorsement before formal deployment. This packet therefore proposes GQM and supplies the complete instrument, but it does not claim that the adviser has approved the framework. Adviser endorsement remains an external pre-collection requirement if the course rule is enforced as written.

## Goal-to-evidence mapping

| SMART goal | Evaluation focus | Operational question | Primary evidence and metric | Questionnaire items |
|---|---|---|---|---|
| Objective 1: Document Check accuracy | deterministic technical classification accuracy and coverage | Does each applicable Document Check assertion match the frozen expected result across the controlled STD benchmark? | 25 benchmark case families; assertion accuracy, coverage, TP/TN/FP/FN and precision/recall where defined, execution errors | None. Participant opinion does not score technical accuracy. |
| Objective 2: AI Review grounded-content screening | checklist agreement, provenance, claim traceability, fresh-run coverage | Does AI Review identify the frozen content issues without inventing requirements, and are substantive claims grounded in the PDF or supplied authority? | 10-fixture fresh-run pilot; decision agreement, claim traceability, fresh-run coverage, cache/quota/provider outcomes | None. Participant opinion does not score technical accuracy. |
| Objective 3: student status/next-action interpretation | correctness of status plus immediate next action | Can students distinguish submitted, advisory checked, revision-requested, accepted, and archived-history situations? | S5-S9 score, STU_TOTAL, percentage with at least 4/5, ceil(0.90*N) threshold | S5-S9 primary; S10-S11 supporting confidence/wording feedback |

Role feedback supports MVP findings and future requirement refactoring but is not substituted for the technical or correctness metrics above:

| Role | Items | Purpose |
|---|---|---|
| Student actual-use | S1-S4 plus S5-S11 | status/next-action clarity, workflow pain points, required qualitative feedback, and Objective 3 scenarios |
| Student scenario-only | S5-S11 | Objective 3 scenarios and scenario wording feedback without pretending current-product use |
| Adviser actual-use/review | A1-A4 | review-state clarity, adviser workflow friction, changes and elements to retain |
| Admin/beneficiary actual-use/review | D1-D4 | advisory-vs-acceptance clarity, operational workflow friction, changes and elements to retain |
| No-use | no role-specific research items | prevents irrelevant or guessed ratings |
| Decliner | consent only | records decline without treating it as participation |

## Sample and evidence boundaries

Plan for at least 30 unique consenting stakeholder participants across varied roles, approximately 27-28 students, 1-2 advisers, and one Admin/beneficiary. This is a planned MVP sample for descriptive evaluation, not a claim of population representativeness.

Keep the participant sample and the technical fixture dataset separate:

- Participant evidence answers Objective 3 and supplies role-specific qualitative findings.
- Document Check and AI Review accuracy come from controlled synthetic PDF fixtures and benchmark logs.
- Students, advisers, and Admin respondents are not asked to grade STD PDFs.
- Sir Ralph Laviste's September 14 transcript is one real qualitative consultation source. It is not a fabricated questionnaire row and does not enter the planned 30-person survey denominator unless he separately submits the finalized consenting form as a real respondent.
- No timed observation is required by this research packet. If optional timing is collected elsewhere later, it must be reported as separate supporting evidence rather than retrofitted into these three objectives.

## Consent and privacy design

The hosted form does not request a name, email address, student number, account username, password, file upload, or private document content. It uses a self-created six-character participant code only for duplicate review. Because any pseudonymous code can still be linkable in context, describe the dataset as pseudonymous/confidential rather than anonymous.

Google documents email collection as an explicit response setting. Keep it disabled under this design: https://support.google.com/docs/answer/139706

Google Forms answer-based section routing is limited to Multiple choice and Dropdown questions and may route to a section or Submit form: https://support.google.com/docs/answer/141062

## Branch-safe pilot procedure

### Documentation audit before building the live form

1. Freeze SMART_OBJECTIVES.md, QUESTIONNAIRE.md, SCORING_AND_CODEBOOK.md, the five-scenario answer key, and both technical benchmark manifests.
2. Have a second team member verify that every S5-S9 scenario has exactly one defensible answer using the current WildTrack behavior and the wording shown to the respondent.
3. Confirm that no scenario calls Document Check or AI Review an acceptance decision.
4. Confirm that the accepted scenario refers to the current saved response version and that the archived scenario describes history separately from the active record.

### Google Forms dry-run after manual construction

Submit six dummy route tests before recruitment. These are form-QA records, not study participants:

1. Student actual-use: C1 Yes -> C2/C3 Student -> C4_STU actual-use -> S1-S4 -> S5-S9 -> S10-S11 -> Submit.
2. Student scenario-only: C1 Yes -> C2/C3 Student -> C4_STU scenario-only -> S5-S9 -> S10-S11 -> Submit. S1-S4 must never appear or become required.
3. Adviser: C1 Yes -> C2/C3 Adviser -> C4_ADV current-use/review -> A1-A4 -> Submit. No student/Admin required item may appear.
4. Admin/beneficiary: C1 Yes -> C2/C3 Admin -> C4_ADM current-use/review -> D1-D4 -> Submit. No student/adviser required item may appear.
5. No-use: C1 Yes -> C2/C3 no-use, or a role-basis insufficient-context choice -> No-use close -> Submit. No role-specific required item may block submission.
6. Decliner: C1 No -> Declined -> Submit. C2, C3, and every research question must be skipped.

For each dry run, record route name, visible sections, whether submission succeeded, and any unexpected required question. Delete or clearly tag dummy QA rows before real recruitment so they cannot enter participant counts.

## Reviewer checklist

- [ ] GQM is labeled proposed and its primary Basili source is cited.
- [ ] The technical-adviser approval requirement remains pending rather than being claimed.
- [ ] All three SMART objectives have object/focus, viewpoint, endpoint, denominator, metric, and proposed threshold.
- [ ] Objective 1 uses all 25 benchmark case families and keeps scheduled execution failures visible.
- [ ] Objective 2 uses the frozen ten-fixture fresh-run pilot and preserves cache/quota/provider outcomes.
- [ ] Objective 3 uses unique eligible students, five scored answers, 4/5 passing, and required_passes = ceil(0.90*N).
- [ ] S5-S9 each ask for both state and immediate next action and have one researcher-only key.
- [ ] Submitted, Document Check/advisory, staff acceptance, and archive history are not conflated.
- [ ] Consent is isolated in its own section so a decliner sees no later required question.
- [ ] Student actual-use and student scenario-only routes are distinguishable in the response data.
- [ ] Adviser/Admin insufficient-context routes can exit without answering role-specific required items.
- [ ] At least one required open-ended qualitative item exists on each substantive consenting role route, with "None" allowed.
- [ ] No respondent is required to grade a PDF or complete a timed observation.
- [ ] Technical benchmark evidence and participant evidence use different folders/tables and different denominators.
- [ ] Sir's consultation remains a labeled qualitative source, never a synthetic survey row.
- [ ] No participant results, benchmark pass rates, adviser approval, or hosted-publication claims are fabricated.

## Google Sheet response and analysis columns

Keep the Google Forms linked response tab raw. Do not overwrite, reorder, or normalize the original response columns in place. Create a separate cleaned-analysis tab with these columns:

response_timestamp
participant_code_raw
participant_code_normalized
duplicate_status
duplicate_resolution_note
consent_code
role_code
basis_code
route_complete
C4_STU
S1
S2
S3_raw
S3_themes
S4_text_redacted
S5_raw
SCORE_S5
S6_raw
SCORE_S6
S7_raw
SCORE_S7
S8_raw
SCORE_S8
S9_raw
SCORE_S9
S10
S11_text_redacted
C4_ADV
A1
A2
A3_raw
A3_themes
A4_text_redacted
C4_ADM
D1
D2
D3_raw
D3_themes
D4_text_redacted
eligibility_status
exclusion_reason
analysis_group
student_total
student_pass
qualitative_codes
coder_note

Use blanks for questions skipped by routing. A legitimate routed blank is not the same as a missing required answer. Keep an exclusion log with participant_code_normalized when available, duplicate_status, exclusion_reason, and the row/timestamp needed to audit the decision.

Do not add an email column under this design. If email collection is later required, revise the consent/privacy wording before collection and document the change.

## Evidence folder plan

The course requires a Google Form, framework/model PDF, linked response Sheet, highlights PDF, and evidence Drive folder. Use a Drive structure that keeps those participant artifacts together while separating technical benchmarks:

WildTrack MVP Validation/
  01 Framework and Instrument/
    SMART Objectives - frozen copy
    Framework and Model - PDF
    Questionnaire - copy-ready source
    Google Form - live validation instrument link
    Scoring and Codebook - frozen copy
    Route Review Checklist
  02 Deployed MVP Evidence/
    deployment screenshots
    role-view screenshots
    version or release note used for validation
  03 Participant Evidence/
    invitation or recruitment evidence
    session screenshots where consent permits
    de-identified notes
  04 Interviews and Consultation Notes/
    Sir Ralph Laviste - 2026-09-14 transcript
    other real interview notes
  05 Raw and Exported Results/
    Google Form response Sheet link
    raw export - access controlled
    cleaned analysis export
    exclusion log
  06 Analysis and Findings/
    Objective 3 scoring table
    role summaries
    qualitative coding memo
    MVP Validation Highlights draft/final
  07 Final Submission PDFs/
    Framework PDF
    MVP Validation Highlights PDF
  08 Technical Benchmarks/
    document-check/
      frozen fixture manifest
      fixtures
      run logs
      scored assertions
    ai-review/
      frozen ten-fixture pilot manifest
      fresh-run logs
      claim provenance adjudication
    limitations/

The response Sheet and participant evidence remain access controlled and should not be committed to the repository merely because this folder plan exists. Synthetic fixtures and benchmark logs are technical evidence, not participant records.

## Reporting rules after collection

For Objective 3, report total consenting rows, exclusions by reason, N_student_eligible, N_student_pass, the observed percentage, required_passes = ceil(0.90*N), and actual-use/scenario-only subgroup results.

For Objectives 1 and 2, report the exact benchmark denominators and coverage as defined in SCORING_AND_CODEBOOK.md. Preserve failure examples, unassessable cases, cache hits, quota failures, and provider failures. Do not replace them with participant ratings.

For qualitative findings, report de-identified themes with counts and representative paraphrases. Do not publish a direct respondent quotation unless separate permission for quotation is documented. Distinguish defects, pain points, missing requirements, recommendations, and positive elements to retain so the later SRS/SDD/SPMP refactoring can trace back to recorded evidence.

Until real collection and benchmark execution occur, report only this proposed design, the completed documentation/branch audit, and any external prerequisites. A passing local documentation check does not prove adviser approval, Google Form publication, recruitment, response collection, technical benchmark success, or final validation completion.
