# WildTrack MVP Validation Framework and Model

**Status:** working Framework/Model source for the required PDF, **not yet adviser-endorsed or the final submission PDF**. The Google Form has already been distributed and its linked `Form_Responses` tab was shown receiving responses; participant totals, actual live form configuration and Goal 3 transactions have not been independently retrieved. The completed Goal 1 component benchmark and separate Goal 2 v6 follow-up have recorded technical results. Goal 1 was narrowed **after** its benchmark; see `GOAL1_SCOPE_AMENDMENT_20260921.md`.

## Evaluation model

WildTrack uses Goal/Question/Metric (GQM) to keep each validation objective tied to its own primary evidence source.

```text
SMART Objective
      |
      v
Operational Question
      |
      v
Frozen Metric + Evidence Source
      |
      v
Result against pre-defined target
```

Role-feedback questionnaire data is supporting evidence only. It does not replace the technical/transaction evidence that scores the three primary objectives.

Primary GQM source: Victor R. Basili, *Software Modeling and Measurement: The Goal/Question/Metric Paradigm*, University of Maryland Technical Report CS-TR-2956 / UMIACS-TR-92-96, 1992.

The model is a goal/measurement structure, not an assertion that the bespoke questionnaire is a validated standardized scale. Formal adviser endorsement of this GQM selection and the amended Goal 1 scope remains to be documented.

## Objective mapping

| Objective | Operational question | Primary construct | Primary evidence | Primary metric |
|---|---|---|---|---|
| 1. Document Check component classifications | Do the production PDF inspector/template comparator and declared simulated gateway branches match the frozen source-grounded project-defined STD fixture labels? | controlled component classification agreement (not live Drive or general academic accuracy) | frozen 25-family/30-condition, 52-assertion project-reference run + dated scope-amendment record | 52/52 = 100% agreement and 52/52 coverage; clarified threshold >=90%; per-signal errors reported separately |
| 2. AI Review grounded-content screening | Does the actual provider plus production postprocessor identify source-backed issues without inventing requirements? | project-defined decision agreement and claim traceability | original frozen v3 STD pilot and **separately** prospectively frozen v6 synthetic follow-up | v6: 9/9 conditional checklist agreement, 10/11 claim support, 9/10 fresh final reports; prior v3 below thresholds |
| 3. Student submission transaction correctness | Does WildTrack correctly reject the prescribed invalid attempt, save the valid response under the correct student record, and preserve the intended revision? | transaction correctness | controlled Refactored SRS T1/T2 task log + WildTrack readback/system evidence | STU_TXN_accuracy = C_STU_TXN / N_STU_TXN; working target >= 95% |

### Technical result interpretation

**Objective 1:** The unchanged frozen technical component run matched 52 of 52 project-authored, AI-assisted expected labels across 25 synthetic STD families and 30 conditions (100% agreement; 100% scheduled classification coverage). Four conditions involve declared simulated Drive-gateway behavior. The original end-to-end objective was **not** demonstrated. Only the owner's later component-scope clarification places the existing result above the revised 90% numerical threshold; approval of that academic scope remains external. Evidence: `benchmarks/std/results/goal1-project-reference-r2-20260921/README.md` and the dated amendment.

**Objective 2:** The original ten-fixture v3 STD pilot recorded 7/10 (70%) project-reference decision agreement and 24/43 (55.8%) supported substantive claims; it did not meet the proposed 85%/90% pilot targets. A new, separately frozen fictional STD v6 follow-up recorded 10/10 one-shot attempts, nine fresh final reports and one HTTP 503 with unknown outcome, 9/9 (100%) matching checklist decisions on fresh final reports, and 10/11 (90.9%) source-supported claims with one unassessable narrative fragment. The two v6 **conditional** measurements reached the proposed thresholds for that **new cohort**; this does not turn the original v3 study into a pass or establish independent real-student accuracy. Evidence: `benchmarks/std/results/goal2-20260921/README.md` and `benchmarks/std-goal2-v6/results/goal2-v6-20260921/RESULT.md`. No further live Gemini calls are needed to prepare the MVP artifact.

**Objective 3:** No transaction-correctness rate is available until genuine eligible students' T1/T2 task records and readbacks are collected and scored. A Google Form respondent's self-report is **not** a T1/T2 system observation. The 95% value is the proposed working target pending course endorsement.

## Objective 3 controlled task model

Use the existing imported MVP Validation workspace and the existing **Refactored SRS** form.

### T1 - Initial submission

1. Student opens the Refactored SRS form.
2. Student attempts to submit without the required PDF link.
3. WildTrack must block the incomplete attempt without creating/overwriting an incorrect response.
4. Student pastes the Google Drive link to their own existing Refactored SRS PDF.
5. Student selects **Initial submission** for the required `Validation step` field.
6. Student submits.
7. Researcher verifies canonical student/workspace/deliverable association, persisted values and student-visible readback.

### T2 - Revised submission

1. Student opens **Edit response** on the same saved response.
2. Student changes only `Validation step` from **Initial submission** to **Revised submission**.
3. Student leaves the PDF link unchanged.
4. Student saves.
5. Researcher verifies response identity preservation, intended changed value, preservation of unchanged values, revision behavior and student-visible readback.

T1/T2 are system/task evidence. They are intentionally not repeated as self-report questions in the Google Form.

## Supporting questionnaire model

The Google Form gathers role-specific descriptive feedback only.

| Role | Supporting construct | Typical evidence |
|---|---|---|
| Student | status/save clarity and current workflow pain points | role-specific ratings + optional comments |
| Adviser | review information/action clarity and workflow pain points | role-specific ratings + optional comments |
| Admin/beneficiary | management/review control feedback | September 14 consultation + optional structured follow-up |

Sir Ralph Laviste's September 14 consultation is the primary Admin/beneficiary qualitative evidence for this validation context. It must not be converted into a synthetic questionnaire row or counted twice as two Admin participants.

### Traceability: goal, construct and questionnaire item

| Primary goal/construct | Primary scoring method | Supporting respondent route and actual question/field |
|---|---|---|
| Goal 1 - deterministic Document Check component classification | Frozen project-reference 52-assertion benchmark; **no survey item scores this** | Student: `Which parts of the student workflow that you actually used or saw should be improved?` includes Document Check information; optional student comment provides context only. |
| Goal 2 - grounded AI Review | Distinct frozen technical pilot decision/claim audit; **no survey item scores this** | Adviser: exposed review features and areas to improve, including available AI Review information; Admin/beneficiary: review/exposure questions if answered. Student route must not assume AI Review explanations are student-visible. |
| Goal 3 - student transaction correctness | Actual Refactored SRS T1/T2 task log and system/readback evidence; **no survey item scores this** | Student: current status-clarity 1-5 and post-save-clarity 1-5 provide descriptive experience feedback only. A Google Form completion answer does not establish a correct T1/T2 transaction. |
| Overall MVP workflow evaluation | Counts, role-specific distributions and de-identified qualitative themes, separate from the three goal scores | Student, adviser and Admin/beneficiary questions about features used, clarity, current pain points and optional written comments. No-use and decliner paths do not contribute role-specific ratings. |

The respondent-facing Google Form and linked response spreadsheet already exist. Do **not** create a replacement form, alter its question order while collecting, or overwrite its original `Form_Responses` tab. Anonymous response rows cannot by themselves prove 30 **unique** consenting people; report the actual deduplication limitation.

## Evidence separation

```text
Objective 1 -> frozen project-defined Document Check component evidence; scope clarified after the run
Objective 2 -> AI Review fresh-run fixture evidence
Objective 3 -> Student T1/T2 task + system/readback evidence
Questionnaire -> Supporting role feedback only
Consultation -> Real qualitative Admin/beneficiary evidence
```

This separation prevents opinion ratings from being misreported as technical accuracy or transaction correctness.

## Sample and privacy boundaries

- Planned validation includes at least 30 unique consenting stakeholder participants across the role mix defined in the research packet. This is the owner/course plan, not a direct Sir Ralph quotation.
- Questionnaire email collection is off under the preferred settings. Do not recreate the respondent-entered participant code.
- Objective 3 may require restricted Student Number/internal record keys to verify canonical response ownership. Use `task_observation_id` in cleaned analysis and final reporting.
- No student submits binary files to WildTrack. The controlled task uses Google Drive PDF links.
- Raw participant/task evidence stays access controlled and should not be committed as ordinary repository content.

## Approval and completion boundaries

- GQM and the owner's post-benchmark Goal 1 component-scope clarification remain subject to course-required adviser/framework endorsement.
- The component run's 52/52 matching classifications meet the clarified numerical target **within that project-defined scope**; this is not independent accuracy or a retrospective pass of the original broader end-to-end objective. Do not claim participant or Goal 3 success before collection.
- Live Google Drive delegated history is separate from these three research denominators; verify deployed consent/history behavior from actual role-specific evidence if it is discussed as an MVP feature.
- Final Highlights must report actual denominators, failures, exclusions and limitations rather than only whether a target was met.
