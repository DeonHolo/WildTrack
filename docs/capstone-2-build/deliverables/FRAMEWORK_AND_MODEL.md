# WildTrack MVP Validation Framework and Model

**Status:** proposed GQM-based evaluation design. This artifact is not adviser-approved and contains no fabricated participant or benchmark results.

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

## Objective mapping

| Objective | Operational question | Primary construct | Primary evidence | Primary metric |
|---|---|---|---|---|
| 1. Document Check accuracy | Do applicable deterministic assertions match the frozen expected results across controlled STD/PDF fixtures? | deterministic checker correctness | frozen fixture manifest + Document Check run logs | assertion accuracy, execution coverage, FP/FN and precision/recall where defined |
| 2. AI Review grounded-content screening | Does AI Review identify frozen content issues without inventing requirements, and are substantive claims traceable to the submitted PDF or configured authority? | grounded content-screening correctness | frozen fresh-run pilot + claim-provenance adjudication | decision agreement, traceability, fresh-run coverage, unsupported-claim count |
| 3. Student submission transaction correctness | Does WildTrack correctly reject the prescribed invalid attempt, save the valid response under the correct student record, and preserve the intended revision? | transaction correctness | controlled Refactored SRS T1/T2 task log + WildTrack readback/system evidence | STU_TXN_accuracy = C_STU_TXN / N_STU_TXN; working target >= 95% |

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

## Evidence separation

```text
Objective 1 -> Document Check fixture evidence
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

- GQM and the numerical targets remain proposed until the course-required adviser/framework endorsement is actually obtained.
- No participant result, benchmark pass rate or objective success claim exists until real data/runs are completed.
- Live Google Drive delegated history is optional and separate from this model. Its local access plan does not constitute authorization or implementation.
- Final Highlights must report actual denominators, failures, exclusions and limitations rather than only whether a target was met.
