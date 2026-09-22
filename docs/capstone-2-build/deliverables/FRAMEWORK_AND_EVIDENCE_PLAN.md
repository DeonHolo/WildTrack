# Framework and evidence plan

**Status:** proposed GQM evaluation design, not adviser-endorsed. The real Google Form is **already deployed/distributed** and its linked `Form_Responses` spreadsheet was shown receiving responses; this source plan does not establish a final count, independently verify every live question, or authorize changing the live instrument. Controlled Goal 1 component and Goal 2 pilot evidence is recorded; real student initial-saved-record/questionnaire analysis remains to be retrieved and scored. Goal 1 was scoped to the already completed component benchmark **after** its run; see `GOAL1_SCOPE_AMENDMENT_20260921.md`. Goal 3 was likewise amended **after Form distribution**; see `GOAL3_INITIAL_SUBMISSION_AMENDMENT_20260922.md`.

## Selected goal-led framework

Use Goal/Question/Metric (GQM) as the measurement-design framework for this MVP evaluation.

Primary source: Victor R. Basili, *Software Modeling and Measurement: The Goal/Question/Metric Paradigm*, University of Maryland Technical Report CS-TR-2956 / UMIACS-TR-92-96, 1992: https://www.cs.umd.edu/~basili/publications/technical/T78.pdf

Basili's approach starts from explicit goals, derives operational questions, then defines metrics that answer those questions. That fits this evaluation because WildTrack has three different primary evidence types that must not be collapsed into one opinion score:

- deterministic Document Check outcomes;
- grounded AI Review outcomes; and
- real student initial saved-record correctness.

GQM is used here to organize the goal-to-evidence trace. The custom role-feedback questionnaire is descriptive validation feedback, not a standardized psychometric scale.

## Why GQM fits the consultation

The September 14 consultation says the SMART goals should come first and the framework/instrument should follow them. Sir also separated ordinary usability from the more substantive technical evaluation and said SUS should not count as one of the three minimum SMART goals.

This design therefore avoids using satisfaction or clarity ratings as proof that a SMART objective was achieved:

- Objective 1 is measured from the frozen controlled Document Check **component** fixture run, with simulated gateway cases disclosed; no new live Google Drive accuracy run is required by the clarified objective.
- Objective 2 is measured from controlled AI Review fixtures.
- Objective 3 is measured from genuine, eligible and appropriately consented initial saved records; researcher-only invalid-link/type/edit tests are separate technical checks.
- The questionnaire supplies supporting student/adviser/Admin feedback about the deployed MVP.

The course notes require framework endorsement before formal deployment. This packet proposes GQM but does not claim adviser approval.

## Goal-to-evidence mapping

| SMART goal | Operational question | Primary evidence | Primary metric | Questionnaire role |
|---|---|---|---|---|
| Objective 1: Document Check component classifications | Do the production PDF inspection/template comparison components and declared simulated gateway branches match the frozen project-defined labels across 52 STD assertions? | source-frozen component manifest + recorded 52-assertion run; separate scope-amendment record | project-reference classification agreement >=90%, execution coverage, per-signal FP/FN and precision/recall where defined | none; participant opinions and live screenshots do not score component accuracy |
| Objective 2: AI Review grounded-content screening | Does AI Review identify frozen content issues without inventing requirements, and are substantive claims traceable to the PDF or supplied authority? | frozen ten-fixture fresh-run pilot + adjudication log | decision agreement, claim traceability, fresh-run coverage, provider/cache/quota outcomes | none; participant opinions do not score AI accuracy |
| Objective 3: Initial saved student-record correctness (amended 2026-09-22) | Among selected, legitimately consented original persisted Refactored SRS responses, is the student, Semester 1 workspace, deliverable, initial version and original required PDF link/fields association correct? | restricted revised initial-record log + independently verifiable saved-system evidence | C_INITIAL / N_INITIAL, proposed >=95% of selected eligible saved records; FAIL and UNVERIFIED remain in denominator | survey is descriptive only; optional student readback is supporting evidence |

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
- Objective 3 is scored only from appropriately consented and eligible initial SAVED Refactored SRS system records, not from survey agreement, presumed failed attempts or forced revisions;
- Document Check and AI Review accuracy come from controlled synthetic PDF fixtures, not from the 30-person questionnaire;
- student/adviser/Admin questionnaire responses provide descriptive MVP validation findings;
- The owner identifies Sir Ralph Laviste as the **sole planned Admin/beneficiary participant**. His September 14 consultation is **one real qualitative Admin contribution**, which includes teacher/adviser and prospective-user perspectives. The transcript's actual findings and exact Part/line references are recorded in `FRAMEWORK_AND_MODEL.md` and `MVP_VALIDATION_HIGHLIGHTS_DRAFT.md`; the same person is not split into separate teacher, user and Admin participants or turned into a fabricated Google Form row. Count him among unique consenting study participants only with genuine applicable consent/eligibility evidence;
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

### Objective 3 initial-saved-record evidence

The revised Objective 3 must verify that the original saved response is attached to the correct canonical student record. The restricted raw study log may therefore contain the minimum internal record key needed for genuine verification; the consent must actually cover analysis of that record. Consent for an old controlled task must not automatically be extended to unrelated ordinary submissions.

Use a researcher-created task_observation_id in cleaned analysis. Do not publish raw Student Numbers or account identifiers.

The questionnaire and task log do not need a respondent-entered shared code. They are separate evidence tables with different purposes.

## Objective 3 revised initial saved-record study (post-distribution amendment)

The originally planned student T1/T2 protocol required a blank-link attempt, an initial save and an artificial edit changing only Validation step. The Form was distributed under that earlier plan. The study owner later observed that many genuine student responses were never edited. The old protocol and observed history are preserved in `GOAL3_INITIAL_SUBMISSION_AMENDMENT_20260922.md` and the archived original Sheet tabs; do not rewrite the earlier invitation as though the amendment preceded it.

Select at most one original saved Refactored SRS response for each eligible, genuinely consenting student in the active Semester 1 MVP Validation workspace, under an explicit, defensible inclusion rule. Label already-inspected cases `PRE_AMENDMENT_SEEN` rather than claiming a fresh blinded sample. Original saved response/version evidence is mandatory; current Revised submission labels or questionnaire task-completion claims alone cannot reconstruct an initial version. Do not infer that every saved response has research consent, or treat previously failed, unsaved attempts as observed successes.

For each selected included record, verify five primary assertions with real saved-system evidence: authentic student association, active Semester 1 workspace, correct Refactored SRS deliverable, authentic original initial saved response ID/version, and the original stored required Drive PDF link and relevant field values. Score each as PASS, FAIL or UNVERIFIED. Student-visible readback is **optional separate supporting evidence** when actually captured; it is not a retrospective screenshot requirement and is not one of the five primary checks.

Define `N_INITIAL` as all genuinely consented selected eligible initial saved records, including FAIL and UNVERIFIED; `C_INITIAL` counts only selected records with all five evidenced primary checks PASS. The proposed working target is `C_INITIAL / N_INITIAL >= 0.95` when `N_INITIAL > 0`. Report unverified evidence separately. This conditional **saved-record** metric cannot measure every attempt that failed before persistence.

Run blank required-link, non-PDF/DOCX and edit/revision behavior as separately documented, researcher-controlled technical tests on a permitted isolated account and fictional content. Verify actual behavior rather than assuming DOCX links must be rejected synchronously at save. These checks never add student participants or numerator entries. Record real version, expected and observed outcomes, and failures without changing a real student's grading/acceptance state. Seek course/adviser endorsement of the amended consent/inclusion method before reporting empirical Goal 3 results.

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
- [ ] Objective 3 uses eligible consented original saved Refactored SRS system records, not questionnaire ratings or unverified all-attempt claims.
- [ ] The post-distribution Goal 3 amendment, 95% proposed saved-record target, original protocol and previously inspected cases remain clearly versioned.
- [ ] Each included student has genuine consent for the actual analyzed record; missing initial-version evidence is UNVERIFIED, not PASS.
- [ ] The five primary checks and optional supporting readback remain separate; FAIL/UNVERIFIED cases remain in the selected denominator.
- [ ] Blank-link, non-PDF/DOCX and edit/revision researcher checks remain separate from student results and reflect actual observed application behavior.
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
    Objective 3 amended initial-saved-record protocol and preserved original T1/T2 version
  02 Deployed MVP Evidence/
    deployment screenshots
    role-view screenshots
    version or release note used for validation
  03 Participant Evidence/
    recruitment evidence
    de-identified session notes
    questionnaire route evidence
  04 Objective 3 Student Transaction Evidence/
    restricted consent/inclusion and original saved-record log
    cleaned initial saved-record scoring table
    original version/system evidence references
    separately labeled researcher invalid-file/edit test observations
  05 Interviews and Consultation Notes/
    Sir Ralph Laviste - 2026-09-14 transcript
    other real interview notes
  06 Raw and Exported Questionnaire Results/
    Google Form response Sheet link
    raw export - access controlled
    cleaned questionnaire analysis
  07 Analysis and Findings/
    Objective 3 initial saved-record summary
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

- genuinely consenting eligible selected students and the inclusion/previously-seen rules;
- N_INITIAL, C_INITIAL, FAIL and UNVERIFIED counts;
- C_INITIAL / N_INITIAL or NOT ESTIMABLE if N_INITIAL = 0;
- whether the proposed 95% saved-record target was met, subject to academic endorsement;
- assertion-level failures and unavailable original-version evidence;
- optional actual student readback observations, separately;
- distinct researcher-controlled invalid-field/type/edit observations and runtime errors; and
- representative de-identified evidence without claiming all-attempt success.

For Objectives 1 and 2, report the exact benchmark denominators/coverage defined in SCORING_AND_CODEBOOK.md. Preserve failure examples, unassessable cases, cache hits, quota failures, and provider failures.

For questionnaire findings, report descriptive counts/distributions and de-identified themes. Do not call a clarity rating technical accuracy, transaction correctness, or measured usability speed.

Until real participant collection is complete, report completed technical results only with their measured scope and original run evidence. A passing local documentation check does not prove adviser approval, student-task success or final validation completion. A repeat full live Drive-path accuracy benchmark is not required by the clarified Goal 1.
