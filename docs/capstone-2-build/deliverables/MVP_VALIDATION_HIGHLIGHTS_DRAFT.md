# WildTrack MVP Validation Highlights and Analysis

**WORKING MARKDOWN DRAFT - 2026-09-21. NOT A FINAL SUBMISSION PDF.** Keep this Markdown as the editable source until real participant results, Goal 3 evidence, endorsement and final academic review are complete; generate the final two PDFs only then.
The live Google Form is already being distributed and its connected `Form_Responses` tab is receiving responses. This draft uses **only recorded technical evidence**; it does not insert guessed respondent counts, Goal 3 passes, completed interviews, adviser endorsement or live Google Drive accuracy measurements. Complete the bracketed items using the existing response spreadsheet and genuine controlled-task records.

## Executive summary

WildTrack's MVP validation uses Goal/Question/Metric (GQM) to separate two controlled technical assessments from one real-student submission-transaction assessment. The **Document Check component benchmark** recorded 52/52 (100%) classifications matching project-defined expected labels across 25 synthetic STD case families and 30 controlled conditions. The owner clarified the originally broader Goal 1 scope to deterministic component classification **after that result was known**; the clarified >=90% numerical target is reached within this limited scope, subject to adviser acceptance of the revised research design. Four cases use simulated Google Drive-gateway inputs, and the project-defined reference is not an independent ground truth or unseen holdout.

The **new, separate AI Review v6 synthetic follow-up** recorded ten single attempts, nine fresh successful production-filtered reports and one HTTP 503 (unknown outcome). The successful reports matched 9/9 frozen project-defined issue/clean decisions (100% conditional agreement); 10/11 substantive claims were source-supported (90.9%), with one unassessable fragmented narrative claim. The proposed 85%/90% pilot measurements were reached **within this new cohort only**. The original v3 STD pilot did not meet them: 7/10 (70%) agreement and 24/43 (55.8%) claim support. These cohorts must not be pooled or represented as independent performance on real students' documents.

**Student transaction correctness (Goal 3), survey analyses, participant count and final MVP conclusions remain pending genuine evidence.** The distributed questionnaire contributes role-specific descriptive feedback; it does not score any of the three primary objectives.

## Validation design and population

The proposed GQM framework links Document Check classifications to the frozen component benchmark, AI Review claim/decision behavior to the separate frozen provider-backed technical pilot, and student submission correctness to actual Refactored SRS T1/T2 records. The academic plan targets at least 30 **unique consenting** stakeholders across student, adviser and Admin/beneficiary roles. Anonymous Google Form response **rows** are not automatically verified unique people. **Sir Ralph Laviste is the sole planned Admin/beneficiary participant**, identified by the study owner. His September 14 consultation contributes **one real qualitative Admin-side evidence record**, including his teacher/adviser and prospective-user perspectives; it is **not** a fabricated questionnaire response or a second participant. Inclusion of his contribution in the final unique consenting-person count still requires the applicable real consent/eligibility record. Formal endorsement of GQM and the amended Goal 1 scope: **[confirm and add dated evidence, or state pending]**.

The existing distributed form and its Google Sheets `Form_Responses` tab are the live questionnaire source. Preserve that raw tab; role routing, consent, exclusions, response counts, optional comments, and 1-5 ratings are to be analyzed in derived sheets without changing the Form while responses arrive. Actual snapshot/analysis date: **[enter]**; consented eligible questionnaire response rows: **[enter]**; independently justified unique-participant count or limitation: **[enter]**; student: **[enter]**; adviser: **[enter]**; Admin/beneficiary: **[enter]**; no-use/declined/manual-review and duplicates: **[enter separately]**.

## Objective 1 - Document Check component reference agreement

| Metric | Recorded result |
|---|---|
| Predeclared case families / conditions | 25 / 30 synthetic STD |
| Applicable classifications / classifications completed | 52 / 52 |
| Matching the frozen project-defined expected label | 52 / 52 = **100%** |
| Revised component-scope target | >=90%; numerical target reached in this scope |
| Failed/unassessable scheduled classifications | 0 |
| Validation method | Actual production PDF inspector/template comparator; four conditions include explicitly simulated gateway inputs |

The expected classifications were authored with AI assistance and frozen before the distinct recorded run; the same synthetic cases and development behavior had been seen before, so this is not an independent holdout test. The original scored result file retains the historical status `PROJECT_DEFINED_COMPONENT_RESULT_NOT_END_TO_END_GOAL_1`. The owner changed Goal 1's formal scope after observing the score, and this post-benchmark amendment must be disclosed in the Framework/Model and final report. Existing real Document Check screenshots may illustrate integration if genuine records are available, but they are **not** part of the above accuracy denominator. No new full Google Drive-path accuracy campaign is required for the clarified Goal 1.

Source: `docs/capstone-2-build/benchmarks/std/results/goal1-project-reference-r2-20260921/{README.md,frozen-key.json,observations.csv,project-reference-score.json}`; `docs/capstone-2-build/deliverables/GOAL1_SCOPE_AMENDMENT_20260921.md`.

## Objective 2 - AI Review grounded-content screening

| Measure | Original frozen v3 STD pilot | Separate frozen fictional v6 follow-up |
|---|---:|---:|
| Fresh successful reports / scheduled attempts | 9 / 10 | 9 / 10 |
| Matching project-reference checklist decisions | 7 / 10 = 70% | 9 / 9 = **100%** of adjudicable fresh FINAL reports |
| Source-supported substantive claims | 24 / 43 = 55.8% | 10 / 11 = **90.9%** |
| Provider availability exception | One HTTP 503 | One HTTP 503, outcome unknown, not retried |
| Interpretation | Original 85%/90% targets not reached | Proposed measurements reached conditionally in the NEW cohort |

The new v6 run uses ten newly authored fictional STD PDFs, actual Gemini responses, the current production postprocessor and an AI-assisted, source-grounded project reference. Its post-run source inventory examined the FINAL report's structured and narrative claims. One conservatively unassessable claim resulted from a quoted heading split by the frozen scorer; there were no independently proven real-document accuracy estimates. The original v3 failure and the distinct v6 cohort are reported side by side without replacing or combining their results.

Sources: `docs/capstone-2-build/benchmarks/std/results/goal2-20260921/README.md` and `docs/capstone-2-build/benchmarks/std-goal2-v6/results/goal2-v6-20260921/{RESULT.md,frozen-key.json,score.json,attempts/,audits/}`.

## Objective 3 - Real student submission-transaction correctness

**PENDING REAL TRANSACTION DATA - do not infer results from questionnaire self-report.** Students use their actual Refactored SRS Google Drive PDF link in the existing MVP Validation workspace. T1 tests a blocked blank-link attempt, then a valid response saved under the correct student/workspace/deliverable with `Validation step = Initial submission`. T2 edits **only** that choice to `Revised submission` on the same response, leaving the PDF link and other values unchanged. Score the frozen system/readback assertions for each started transaction; failures caused by WildTrack remain in the denominator. This is untimed.

| Measure | Fill from researcher task log and system evidence |
|---|---|
| Eligible students who began the controlled protocol | **[pending]** |
| Scored T1/T2 transactions (N_STU_TXN) | **[pending]** |
| Transactions satisfying every applicable assertion (C_STU_TXN) | **[pending]** |
| STU_TXN_accuracy = C_STU_TXN / N_STU_TXN | **[pending]** |
| Proposed working target >=95% reached? | **[pending; not estimable if N=0]** |
| Students whose T1 and T2 both passed | **[pending]** |
| Blocked-by-prior-system-failure / withdrawals / nonresearch stops / runtime errors | **[pending; separate categories]** |
| Assertion-level failure examples and evidence references | **[pending, de-identified]** |

Source to populate later: existing authorized Admin Validation Study export, real restricted task log, response IDs/revision readbacks, screenshots or request logs, and `SCORING_AND_CODEBOOK.md`. The existing questionnaire's answer about whether a participant completed the workflow **cannot** establish correctness of the saved WildTrack transaction.

## Role-specific feedback and consultation

**PENDING FORM ANALYSIS.** Record consenting eligible response-row denominator per role, 1-5 current status/save clarity and adviser/Admin clarity distributions (not merely averages), frequency of actually selected improvement areas, and genuinely de-identified themes from written responses. Optional comments may be blank and are not failed questionnaires. If Google Forms has no reliable participant-identity field, explain that unique-person counts cannot be independently verified from raw answer similarity alone. Preserve the anonymous raw Form response tab and keep restricted transaction identity separate.

### Sole Admin/beneficiary contribution - Sir Ralph Laviste, September 14

**Evidence classification.** The owner identifies Sir Ralph as the study's **only Admin/beneficiary participant**. In the September 14 consultation he speaks as a teacher/adviser, prospective system user and beneficiary, and distinguishes a teacher's security requirement from a user's familiarity preference. The transcript labels the speaker `Adviser`; his identity and planned Admin role are established by the owner's study plan. This is **one person's formative qualitative contribution** from a demonstration/consultation, **not** an Admin Google Form response, a second Admin participant, a post-implementation user-acceptance signoff or a scored SMART-goal result. Source: `docs/TRANSCRIPT CAPSTONE 2.md`, Part 01, lines 125-131; Part 06, lines 455-470.

| Consultation finding (faithful paraphrase) | Direct supporting transcript location | Implication / verification boundary |
|---|---|---|
| **Configurable forms and familiar editor.** He describes the demonstrated form automation as offering limited configuration and explains that Google Forms is familiar to him: he expects to be able to add fields and select input modes such as dropdowns, open text and lists. He says this user-perspective preference should **not** be treated as an instruction to reproduce every Google Forms feature. | `docs/TRANSCRIPT CAPSTONE 2.md`, Part 02, lines 149-168; Part 06, lines 455-459. | Requirements input for a configurable Form Editor. Whether the present editor meets the stated workflow needs must be checked against its current implementation or a genuine later user review; the consultation alone proves neither. |
| **Student-record privacy and identity association.** He flags unrestricted student-number lookup as allowing access to another student's status and discusses binding a Google-authenticated account to one student's class-record entry rather than relying solely on a burdensome OTP step. | Same transcript, Part 02, lines 180-201 and 209-213; Part 03, lines 220-226. | Teacher/admin security requirement informing account-binding and role-scoped access. Do not claim the September 14 discussion independently certifies later authentication/security fixes. |
| **Meaningful content, not filename/template alone.** He identifies valid file access/PDF readability as useful, but warns that renaming an SRS as an SPMP, submitting the wrong deliverable, or filling a matching template with irrelevant/empty content should not pass content filtering. He distinguishes identifying truthful/relevant submissions from grading their academic quality. | Same transcript, Part 04, lines 285-304, 319-323 and 343-346; Part 05, lines 354-383 and 391-405. | Motivates Document Check's technical signals **and** separate bounded AI Review/content screening. Do not infer that the 52/52 deterministic Goal 1 component result establishes content truthfulness or that Sir approved the newer model outputs. |
| **Submission edits and evidence history.** He describes students submitting blank templates before deadlines and editing later, and asks for creation/modification dates, version counts and editor/author information so staff can inspect change history without opening every Drive file manually. | Same transcript, Part 04, lines 310-315; Part 05, lines 405-431. | Requirements input for honest, source-labeled submission history and eligible Google Drive metadata. The consultation does not establish that every Drive file exposes revisions or that all later history features have been tested by him. |

**Interpretation for the Admin contribution:** Sir Ralph offered early evidence of desired workflows, privacy risks and submission-monitoring limitations. Those observations are already available and need not wait for Goal 3 or a new Admin questionnaire. They **do not** demonstrate post-change satisfaction, current feature correctness or a new observation of student T1/T2 performance. If a genuine dated Admin follow-up occurs, append its distinct findings without adding another unique person to the participant count. Any consultation comment made by a *student speaker* is not presented above as Sir Ralph's finding.

## Functional findings and proposed actions

The final course-required highlights must separately list (a) observed user pain points/system defects, (b) incomplete or changed functional requirements, (c) positive core elements to retain, and (d) prioritized changes before full implementation. **Do not turn a technical test limitation into an invented participant complaint.** The preceding four Admin findings are already documented **consultation-stage requirements/concerns**. Do not report them as defects observed in the present deployed version or as post-implementation dissatisfaction without further evidence. Candidate questions for *after* reviewing actual evidence: Were correct submission status and save outcomes visible? Were accessible artifact links and Document Check reports comprehensible? Did T1/T2 persistence or identity checks ever fail? Did real advisers encounter unclear review actions? Enter each confirmed finding as **[observation; source/evidence; affected role; actual occurrence count; proposed response]**; label unobserved engineering suggestions separately.

## Limitations and final interpretation

The clarified Goal 1 target is a project-reference **component** result, approved by the owner after measurement but not yet adviser-endorsed. The AI Review v6 result is a new and small synthetic cohort with one transport failure and project/AI-assisted source auditing, not general accuracy on students' submissions. Live Google Drive retrieval reported by the owner is operational context, not a frozen research denominator. Student transaction correctness and real stakeholder feedback remain to be calculated. Do not report the entire MVP validation as complete until actual respondent/task evidence and the final two PDF artifacts are prepared and adviser/academic requirements are reconciled.

## Final evidence-link checklist (fill before submission)

| Required reference | Actual location and access-check status |
|---|---|
| Distributed Google Form / Validation Instrument | **[existing live Form URL; test respondent access]** |
| Linked Google response Sheet / Validation Response Sheet | **[existing spreadsheet URL; raw and derived tabs; correct instructor access]** |
| GQM Framework and Model final PDF | **[final PDF after adviser review; current source: FRAMEWORK_AND_MODEL.md]** |
| Goal 1 frozen source and score + dated scope amendment | **[Drive evidence location]** |
| Goal 2 original v3 and distinct v6 frozen attempt/final audit packages | **[Drive evidence location]** |
| Goal 3 restricted raw task log and separately cleaned summary | **[restricted location + de-identified summary]** |
| Sir's real consultation and actual participant feedback/sessions | **[permission-scoped Drive evidence location]** |
| Deployed MVP/version and role-specific screenshots | **[verified version/date and screenshots]** |
| Final Highlights PDF + organized evidence Drive folder | **[final URLs and share/access verification]** |
