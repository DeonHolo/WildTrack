# WildTrack MVP validation evidence manifest

**Status:** prepared-local folder and naming plan. The technical benchmark records and a real September 14 stakeholder consultation exist; the owner has distributed the actual Google Form and shown its connected response Sheet. This file does not imply that the Drive evidence folders or complete participant evidence have been created or uploaded. Use `EVIDENCE_INDEX_WORKING.md` for concrete available source paths and outstanding entries.

## Recommended structure

```text
WildTrack MVP Validation/
  01 Framework and Instrument/
    SMART Objectives - frozen copy
    Framework and Model - PDF
    Questionnaire - frozen copy
    Google Form - live instrument link.txt
    Scoring and Codebook - frozen copy
    Objective 3 Student Task Protocol - frozen copy
    Questionnaire Route Review Checklist
  02 Deployed MVP Evidence/
    deployment screenshots/
    role-view screenshots/
    validation-version-note.txt
  03 Participant Evidence/
    recruitment evidence/
    de-identified session notes/
    questionnaire route evidence/
  04 Objective 3 Student Transaction Evidence/
    RESTRICTED - raw task log
    cleaned task scoring table
    screenshots-and-log-index
    transaction failure examples/
  05 Interviews and Consultation Notes/
    Sir Ralph Laviste - 2026-09-14 transcript
    other real interview notes/
  06 Raw and Exported Questionnaire Results/
    Google Form response Sheet link.txt
    RESTRICTED - raw exports/
    cleaned questionnaire analysis/
  07 Analysis and Findings/
    Objective 1 summary
    Objective 2 summary
    Objective 3 transaction summary
    role feedback summaries
    qualitative coding memo
    MVP Validation Highlights draft
  08 Final Submission PDFs/
    Framework and Model.pdf
    MVP Validation Highlights.pdf
  09 Technical Benchmarks/
    document-check/
      frozen fixture manifest
      fixtures/
      run logs/
      scored assertions/
    ai-review/
      frozen pilot manifest
      fresh-run logs/
      claim-provenance adjudication/
    limitations/
```

## Evidence naming

Use stable non-identifying names where possible:

- `txn-<task_observation_id>-t1-<evidence-kind>.<ext>`
- `txn-<task_observation_id>-t2-<evidence-kind>.<ext>`
- `doccheck-<fixture_id>-<run-id>.json`
- `aireview-<fixture_id>-<run-id>.json`

Do not put Student Number, Google subject, email or full participant name in filenames intended for shared analysis folders.

## Access boundary

- Raw Student Number/account evidence and raw questionnaire exports are restricted team/research data.
- Cleaned analysis replaces direct student identity with `task_observation_id`/`survey_row_id`.
- Sir Ralph's real consultation transcript can be referenced as Admin/beneficiary qualitative evidence but must not be converted into a synthetic survey row.
- Do not commit raw participant evidence to the repository merely because this manifest is version controlled.
