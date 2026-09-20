# Framework and evidence plan

**Status:** proposed GQM evaluation design, not adviser-endorsed. The real Google Form is **already deployed/distributed** and its linked `Form_Responses` spreadsheet was shown receiving responses; this source plan does not establish a final count, independently verify every live question, or authorize changing the live instrument. Controlled Goal 1 component and Goal 2 pilot evidence is recorded; real student transaction/questionnaire analysis remains to be retrieved and scored. Goal 1 was scoped to the already completed component benchmark **after** its run; see `GOAL1_SCOPE_AMENDMENT_20260921.md`.

## Selected goal-led framework

Use Goal/Question/Metric (GQM) as the measurement-design framework for this MVP evaluation.

Primary source: Victor R. Basili, *Software Modeling and Measurement: The Goal/Question/Metric Paradigm*, University of Maryland Technical Report CS-TR-2956 / UMIACS-TR-92-96, 1992: https://www.cs.umd.edu/~basili/publications/technical/T78.pdf

Basili's approach starts from explicit goals, derives operational questions, then defines metrics that answer those questions. That fits this evaluation because WildTrack has three different primary evidence types that must not be collapsed into one opinion score:

- deterministic Document Check outcomes;
- grounded AI Review outcomes; and
- real student submission/revision transaction correctness.

GQM is used here to organize the goal-to-evidence trace. The custom role-feedback questionnaire is descriptive validation feedback, not a standardized psychometric scale.

## Why GQM fits the consultation

The September 14 consultation says the SMART goals should come first and the framework/instrument should follow them. Sir also separated ordinary usability from the more substantive technical evaluation and said SUS should not count as one of the three minimum SMART goals.

This design therefore avoids using satisfaction or clarity ratings as proof that a SMART objective was achieved:

- Objective 1 is measured from the frozen controlled Document Check **component** fixture run, with simulated gateway cases disclosed; no new live Google Drive accuracy run is required by the clarified objective.
- Objective 2 is measured from controlled AI Review fixtures.
- Objective 3 is measured from real student submission/revision tasks and system evidence.
- The questionnaire supplies supporting student/adviser/Admin feedback about the deployed MVP.

The course notes require framework endorsement before formal deployment. This packet proposes GQM but does not claim adviser approval.

## Goal-to-evidence mapping

| SMART goal | Operational question | Primary evidence | Primary metric | Questionnaire role |
|---|---|---|---|---|
| Objective 1: Document Check component classifications | Do the production PDF inspection/template comparison components and declared simulated gateway branches match the frozen project-defined labels across 52 STD assertions? | source-frozen component manifest + recorded 52-assertion run; separate scope-amendment record | project-reference classification agreement >=90%, execution coverage, per-signal FP/FN and precision/recall where defined | none; participant opinions and live screenshots do not score component accuracy |
| Objective 2: AI Review grounded-content screening | Does AI Review identify frozen content issues without inventing requirements, and are substantive claims traceable to the PDF or supplied authority? | frozen ten-fixture fresh-run pilot + adjudication log | decision agreement, claim traceability, fresh-run coverage, provider/cache/quota outcomes | none; participant opinions do not score AI accuracy |
| Objective 3: Student submission transaction correctness | Does WildTrack correctly reject the prescribed invalid attempt, save the valid student response under the correct record, and preserve the intended material revision? | controlled student task log + WildTrack system/readback evidence | STU_TXN_accuracy = C_STU_TXN / N_STU_TXN, target >= 95% | student survey is supporting feedback only |

## Role feedback mapping

| Role | Questionnaire purpose |
|---|---|
| Student | current status/save clarity, actual student-workflow pain points, optional comment |
| Adviser | current review information/actions, actual adviser-workflow pain points, optional comment |
| Admin/beneficiary | current management/review controls, actual Admin-workflow pain points, optional comment |
| No-use | prevents guessed ratings from people without enough current-product exposure |
| Decliner | records decline without treating it as participation |

Questionnaire responses may inform requirement refactoring and MVP findings. They do not replace the three objective-specific evidence streams.

## Sample and evidence boundaries

Plan for at least 30 unique consenting stakeholder participants across varied roles, approximately 27-28 students, 1-2 advisers, and one Admin/beneficiary. This is an owner/course validation plan, not a direct quotation from Sir Ralph and not a claim of population representativeness.

The evidence boundaries are:

- participating students are the primary human participant group for Objective 3;
- Objective 3 is scored from their controlled WildTrack task results, not from survey agreement;
- Document Check and AI Review accuracy come from controlled synthetic PDF fixtures, not from the 30-person questionnaire;
- student/adviser/Admin questionnaire responses provide descriptive MVP validation findings;
- Sir Ralph Laviste's September 14 consultation is one real qualitative consultation source, not a fabricated Google Form row;
- because Sir Ralph is the sole Admin/beneficiary for this validation context and explicitly framed the consultation transcript as his Admin-side input, use that transcript as the primary Admin/beneficiary qualitative evidence. Do not count him again as a second Admin participant merely because the Google Form also contains an Admin route. The Admin form route remains optional/supplemental if the study team later needs a structured follow-up from him;
- no timed observation or learnability-speed claim is required.

## Consent and privacy design

### Questionnaire

The questionnaire does not ask for a name, email address, Student Number, account username, password, file upload, API key, or private document content.

Preferred duplicate-control setting:

- **Collect email addresses:** off
- **Limit to 1 response:** on when participant Google sign-in is acceptable

Google currently documents that Limit to 1 response requires sign-in but usernames are not recorded unless email collection is enabled: https://support.google.com/docs/answer/2839588

Do not recreate the old self-generated six-character participant code.

### Objective 3 task evidence

The Objective 3 task must verify that a response is attached to the correct canonical student record. The restricted raw task log may therefore contain the minimum Student Number/internal record key needed for that verification.

Use a researcher-created task_observation_id in cleaned analysis. Do not publish raw Student Numbers or account identifiers.

The questionnaire and task log do not need a respondent-entered shared code. They are separate evidence tables with different purposes.

## Objective 3 controlled student task

### Pre-collection setup

1. Use the existing imported MVP Validation workspace; do not create a second fake workspace solely for Objective 3.
2. Use **Refactored SRS** as the common target existing published form for the student sample.
3. Confirm the old official SRS template is configured for Refactored SRS so the normal Document Check comparison is available.
4. Add one required research-only multiple-choice field to the Refactored SRS form: **Validation step**, choices **Initial submission** and **Revised submission**.
5. Participants paste the Google Drive link to their own existing old Refactored SRS PDF. WildTrack does not receive a file upload.
6. Freeze the task instructions, one required-link invalid/incomplete attempt, the valid link submission with Validation step = Initial submission, and the T2 edit that changes only Validation step to Revised submission.
7. Freeze the exact assertion list in SCORING_AND_CODEBOOK.md.
8. Verify the task against the current deployed student UI before recruitment.
9. Have a second team member review the expected assertions before seeing participant results.
10. Ensure the validation task cannot affect real grading, real course acceptance, or unrelated student records.

### Per-student task

Each eligible participating student is scheduled for:

1. **Initial-submission task**
   - open the Refactored SRS form;
   - attempt submission without the required PDF link;
   - confirm WildTrack blocks it as specified;
   - paste the participant's own existing Refactored SRS Google Drive PDF link;
   - choose **Initial submission** for Validation step;
   - submit the response;
   - researcher verifies correct record/value/state evidence.

2. **Material-revision task**
   - reopen the saved response;
   - change only Validation step from **Initial submission** to **Revised submission**;
   - leave the SRS PDF link unchanged;
   - save;
   - researcher verifies the intended change, preservation of other values, response identity, revision behavior, and student-visible readback.

The task is untimed. The researcher may clarify the written task instruction but must not operate the student's UI on the student's behalf.

### Scoring

Each T1/T2 task passes only when all applicable frozen assertions pass.

Primary metric:

STU_TXN_accuracy = C_STU_TXN / N_STU_TXN

Working target:

STU_TXN_accuracy >= 0.95

Keep system/runtime failures visible. Report unique students, total scheduled/scored transactions, assertion failures, students whose two tasks both passed, withdrawals, and unassessable conditions.

## Google Forms route verification (the Form has already been distributed)

The original pre-distribution plan called for checking these routes. **Do not inject dummy rows or alter the active Form during ongoing collection.** If route verification already occurred, file genuine pre-collection screenshots/logs; if not, compare current live Form configuration in read-only editor/preview and document the limitation before any separate test session. The six planned routes were:

1. Student controlled-task participant.
2. Student other-current-use feedback.
3. Adviser.
4. Admin/beneficiary.
5. No-use.
6. Decliner.

For each route, verify:

- the correct role-specific questions appear;
- no other role's required question blocks submission;
- no respondent-facing internal item codes appear;
- optional comments may be left blank;
- student options do not mention student-invisible AI Review explanation or submission/history UI;
- any pre-existing dummy rows can be identified from actual recorded testing evidence without treating real participant rows as disposable; do not delete active live response data.

## Reviewer checklist

- [ ] GQM is labeled proposed and its primary Basili source is cited.
- [ ] Adviser/framework endorsement is not falsely claimed.
- [ ] Objective 1 uses the completed project-reference **component** benchmark, preserves scheduled failures, and discloses its post-observation scope amendment, known fixture population and simulated Drive branches.
- [ ] Objective 2 uses the frozen fresh AI pilot and preserves cache/quota/provider outcomes.
- [ ] Objective 3 is student-facing and scored from real WildTrack transaction evidence rather than survey opinion.
- [ ] Objective 3 uses the frozen T1/T2 protocol and 95% transaction-correctness target.
- [ ] The invalid T1 attempt cannot create/overwrite an incorrect response.
- [ ] T1 verifies canonical student/workspace/deliverable association, persisted values, and visible state.
- [ ] T2 verifies intended changed value, preservation of unchanged values, response identity, revision behavior, and visible state.
- [ ] Student Number/account details remain in restricted raw evidence only.
- [ ] Questionnaire contains no typed participant code and no scenario quiz.
- [ ] Questionnaire contains no student AI Review explanation or submission/history option unless the deployed UI changes before freeze.
- [ ] Optional qualitative comments are genuinely optional.
- [ ] Decliners/no-use respondents are not forced through role-specific questions.
- [ ] Participant feedback and technical benchmark evidence use different tables/denominators.
- [ ] Sir's consultation remains a labeled qualitative source, never a synthetic survey/task row.
- [ ] No participant result, benchmark pass rate, adviser approval, or hosted-publication claim is fabricated.

## Google Sheet response and analysis columns

Keep the Google Forms linked response tab raw. Create a separate cleaned questionnaire-analysis tab.

Suggested questionnaire analysis columns:

response_timestamp
survey_row_id
consent_code
role_code
student_basis
student_status_clarity
student_save_clarity
student_improvement_raw
student_improvement_themes
student_comment_redacted
adviser_basis
adviser_exposure_raw
adviser_clarity
adviser_improvement_raw
adviser_improvement_themes
adviser_comment_redacted
admin_basis
admin_exposure_raw
admin_clarity
admin_improvement_raw
admin_improvement_themes
admin_comment_redacted
route_complete
survey_duplicate_status
exclusion_reason
qualitative_codes
coder_note

Do not add a participant-code column. Do not add email under the preferred form settings.

Maintain Objective 3 in a separate restricted task-log/analysis table using the fields defined in SCORING_AND_CODEBOOK.md.

## Evidence folder plan

WildTrack MVP Validation/
  01 Framework and Instrument/
    SMART Objectives - frozen copy
    Framework and Model - PDF
    Questionnaire - copy-ready source
    Google Form - live validation instrument link
    Scoring and Codebook - frozen copy
    Questionnaire Route Review Checklist
    Objective 3 Student Task Protocol - frozen copy
  02 Deployed MVP Evidence/
    deployment screenshots
    role-view screenshots
    version or release note used for validation
  03 Participant Evidence/
    recruitment evidence
    de-identified session notes
    questionnaire route evidence
  04 Objective 3 Student Transaction Evidence/
    restricted raw task log
    cleaned task scoring table
    task screenshots/log references
    transaction failure examples
  05 Interviews and Consultation Notes/
    Sir Ralph Laviste - 2026-09-14 transcript
    other real interview notes
  06 Raw and Exported Questionnaire Results/
    Google Form response Sheet link
    raw export - access controlled
    cleaned questionnaire analysis
  07 Analysis and Findings/
    Objective 3 transaction summary
    role feedback summaries
    qualitative coding memo
    MVP Validation Highlights draft/final
  08 Final Submission PDFs/
    Framework PDF
    MVP Validation Highlights PDF
  09 Technical Benchmarks/
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

Raw participant/task evidence remains access controlled and should not be committed to the repository merely because this folder plan exists.

## Reporting rules after collection

For Objective 3 report:

- unique eligible participating students;
- N_STU_TXN and C_STU_TXN;
- STU_TXN_accuracy;
- whether the 95% target was met;
- number/percentage of students whose two transaction tasks both passed;
- assertion-level failure counts;
- runtime/system errors;
- withdrawals/non-research stops; and
- representative de-identified failure evidence.

For Objectives 1 and 2, report the exact benchmark denominators/coverage defined in SCORING_AND_CODEBOOK.md. Preserve failure examples, unassessable cases, cache hits, quota failures, and provider failures.

For questionnaire findings, report descriptive counts/distributions and de-identified themes. Do not call a clarity rating technical accuracy, transaction correctness, or measured usability speed.

Until real participant collection is complete, report completed technical results only with their measured scope and original run evidence. A passing local documentation check does not prove adviser approval, student-task success or final validation completion. A repeat full live Drive-path accuracy benchmark is not required by the clarified Goal 1.
