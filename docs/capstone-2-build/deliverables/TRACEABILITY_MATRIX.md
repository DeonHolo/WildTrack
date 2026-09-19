# Capstone 2 validation and implementation traceability matrix

**Status:** living local traceability record. Statuses describe current repository evidence, not production deployment or adviser approval.

| Source finding / decision | Requirement | Ticket(s) | Current evidence / verification | Status |
|---|---|---|---|---|
| Consultation: SMART goals should drive framework/instrument | define measurable objectives before collection | 01 | SMART_OBJECTIVES.md; FRAMEWORK_AND_EVIDENCE_PLAN.md; SCORING_AND_CODEBOOK.md | prepared; adviser/framework endorsement still external |
| Consultation: ordinary usability/SUS is not one of the three primary goals | keep opinion ratings supporting only | 01,11 | QUESTIONNAIRE.md separates role feedback from objective scoring | implemented in research packet |
| Consultation: technical truthfulness/access/PDF integrity/readable text matter | deterministic Document Check benchmark | 10 | existing FileCheckService tests; frozen benchmark still pending Ticket 10 | open |
| Consultation: wrong deliverable/filler matter, but system should not grade academic correctness | grounded AI Review/content-screening benchmark | 10 | AI grounding/no-template protections already implemented; controlled pilot pending | open |
| Owner decision: Objective 3 is student submission transaction correctness | frozen T1/T2 against Refactored SRS | 01,11 | current protocol in framework/codebook; live participant evidence pending | protocol prepared |
| Owner decision: T1/T2 are system/task evidence, not Google Form self-report | keep task log separate from questionnaire | 01,11 | QUESTIONNAIRE.md + VALIDATION_RESPONSE_SHEET_SCHEMA.md | prepared |
| Owner decision: student submissions are links/fields only | no student file-upload type | 02,03,12 | editor/public flow tests and prior browser evidence | verified local |
| Need editable academic setup without abandoning imports | backend-connected Students/Teams/Deliverables grids | 04 | Prompt 2 implementation in progress | in progress |
| Local edits must survive a later source import until resolved | read-only re-import conflict preview + explicit apply | 05 | depends on Ticket 04 | pending |
| Owner decision: first successful save binds Google account | atomic first-claim association | 06 | Prompt 2 implementation in progress | in progress |
| Cross-semester continuity must not widen workspace access | canonical account/person association + scoped membership | 06 | focused security/concurrency verification required | in progress |
| Admin needs simple recovery, not an Identity History-centered workflow | disconnect/recover binding while preserving audit | 06 | Prompt 2 implementation in progress | in progress |
| No-op saves must not create fake lateness/revisions | meaningful-change timestamp semantics | 07 | existing no-op response behavior partly covered; full lateness slice pending | pending |
| File/check observation must not be sold as complete Drive history | source-labeled WildTrack-observed versions | 08 | depends on Ticket 07 | pending |
| Older Drive history requires genuine delegated permission | optional OAuth integration, pasted links preserved | 09 | DRIVE_HISTORY_ACCESS_PLAN.md | prepared-local; owner authorization required |
| Controlled technical benchmark must preserve failures/quota cases | frozen Document Check + AI Review fixture runs | 10 | benchmark plan exists; execution pending | pending |
| Validation package needs auditable evidence organization | response schema, manifest, highlights, traceability | 11 | Ticket 11 local preparation files | in progress |
| Full session must close with integrated regression/security review | verify all completed slices without pretending external work is done | 12 | editor-mode closeout exists; full-mode closeout pending | pending |

## Deferred/external trace items

- Production deployment is not part of Prompt 2 automatic execution.
- Live Google OAuth consent/history verification for Ticket 09 needs explicit owner authorization and genuine eligible Drive access.
- Real questionnaire/Objective 3 results cannot be completed without participant responses.
- Adviser/framework endorsement must remain labeled pending unless actually obtained.
