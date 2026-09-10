# WildTrack MVP Validation Worksheet — Working Draft

Status: **Draft for team review and adviser/customer confirmation**  
Prepared: 2026-09-10  
Target submission in IT411 tracker: MVP Validation  
Stated deadline: 2026-09-12 11:59 PM

## 1. Current MVP being validated

WildTrack is a web-based capstone workflow and monitoring system designed around the existing Google-based processes used by capstone students and faculty. The current MVP includes academic workspaces, source-Sheet import/mapping, Google-attributed student identity, deliverable-specific submission forms, Google Drive/PDF submission validation, student status views, tracker monitoring, adviser/team review, deterministic Document Check, optional Admin AI Review, feedback/acceptance, and archival-related workflows.

The May 2026 CapVault SRS/SDD are historical baseline documents only. They do not accurately specify the current WildTrack MVP and will be refactored after empirical validation.

## 2. Problem statement — working draft

Capstone submission and monitoring activities are distributed across Google Sheets, Google Drive links, forms, adviser communication, and manual document checking. At class scale, faculty must repeatedly identify students/teams, determine submission and lateness status, open individual Drive files, inspect whether files are usable or structurally complete, and communicate review outcomes. Students also need a clear way to submit the correct document, understand whether their submission was accepted by the system, and view follow-up status or feedback.

WildTrack aims to reduce this fragmented and repetitive workflow without replacing the Google-based academic records already used by the capstone program.

## 3. Proposed evaluation framework

### Primary framework: ISO 9241-11 usability framework

Constructs:

- **Effectiveness** — whether target users can complete the intended WildTrack tasks correctly.
- **Efficiency** — the effort/time required to complete those tasks and whether unnecessary manual steps are reduced.
- **Satisfaction** — whether users find the resulting workflow clear, usable, and acceptable.

### Supporting instruments

- **System Usability Scale (SUS)** — standardized 10-item usability questionnaire.
- **Task Success Rate** — success/failure and assistance required for representative workflows.
- **Time-on-Task** — optional/strongly preferred for an observed subset; not required for every participant.
- **Role-specific qualitative questions** — open-ended comments about pain points, useful features, missing requirements, and recommended changes.

Rationale: WildTrack is primarily an operational workflow system. The validation must show not only whether respondents like the interface, but whether students and faculty can actually complete submission, monitoring, and review tasks with acceptable effort.

## 4. Recommended SMART objectives — practical version

These objectives are deliberately measurable with a mostly remote 30+ respondent validation. They should be shown to the adviser/customer for approval or adjustment before being treated as final.

### WT-SMART-01 — Student submission effectiveness

During MVP validation, at least **90% of participating student users** should be able to complete the assigned WildTrack submission workflow using a valid deliverable link and Google Drive submission without a facilitator completing any step for them.

**Measures:** task completed (yes/no), assistance required, blocking error, qualitative explanation.

### WT-SMART-02 — Submission/status clarity

During MVP validation, at least **85% of participating student users** should correctly understand whether their test submission was accepted, requires correction, or is awaiting/requiring review, based on the feedback/status displayed by WildTrack.

**Measures:** short scenario/comprehension item, self-reported clarity rating, open-ended confusion comments.

### WT-SMART-03 — Faculty monitoring and review effectiveness

During MVP validation, at least **85% of participating faculty/adviser/admin users** should be able to locate a specified student/team submission, identify its submission/review condition, and reach the appropriate review details without facilitator intervention.

**Measures:** task success, assistance required, observed/self-reported difficulty, comments.

### WT-SMART-04 — Workflow efficiency / reduced manual effort

At least **80% of participating faculty/adviser/admin users** should agree that WildTrack reduces repetitive effort involved in locating, opening, checking, or monitoring capstone submissions compared with their usual Google Sheets/Drive/manual workflow.

**Measures:** 5-point Likert agreement item and qualitative explanation. If an observed comparison can be run, add time-on-task as stronger supporting evidence.

### WT-SMART-05 — Overall usability

The WildTrack MVP should achieve an overall **System Usability Scale (SUS) score of at least 68** among the respondents who complete representative system tasks, while qualitative responses identify concrete areas to retain, improve, add, or remove before full implementation.

**Measures:** standard 10 SUS items, calculated SUS score, open-ended feedback.

## 5. Respondent plan

Target: **N >= 30** total participants.

Current realistic recruitment is not yet fixed. Aim for as much role diversity as available rather than fabricating a balanced sample.

Recommended priority:

- majority: CIT-U students who can realistically perform the student submission/status flow;
- several advisers/faculty if available;
- Sir Ralph / target decision-maker as high-value qualitative validation, currently expected on 2026-09-14.

Because the Sir Ralph meeting is currently after the stated 2026-09-12 deadline, any pre-deadline package must clearly distinguish completed validation from pending follow-up customer consultation.

## 6. Respondent identification fields — proposed

If the team/instructor wants identifiable evidence that respondents are part of CIT-U, the raw Form may collect:

- Full name — required if instructor expects identifiable respondents;
- Respondent role — Student / Adviser-Faculty / Admin-Decision-maker / Other;
- Program/course — e.g. BSIT, BSCS, other;
- Year level;
- Section, where applicable;
- CIT-U Student/Employee ID — collect only if actually needed as evidence;
- Optional institutional email, if the team prefers this over collecting an ID number.

Add a brief consent/privacy statement explaining that the information is collected for IT411 MVP validation and academic evidence. Keep identifiable raw responses restricted to the team/instructor. Use participant IDs (P01, P02, etc.) rather than full names in the public/summary analysis wherever possible.

## 7. Validation task script — draft

### Student path

1. Open the assigned WildTrack validation link.
2. Continue with Google / establish the expected identity association.
3. Open the assigned deliverable form.
4. Submit the requested valid Google Drive/PDF link or configured field(s).
5. Confirm the result shown after submission.
6. Open the student status/dashboard view and identify the current submission status.
7. If the test scenario includes an invalid/private/non-PDF link, explain what WildTrack is asking the user to correct.

Record task completion, assistance, error/friction, and optionally completion time.

### Adviser/faculty path

1. Sign in.
2. Open the assigned team/adviser view.
3. Locate a specified team/student and deliverable.
4. Identify whether the submission is received, missing/late, flagged, or ready for review.
5. Open the submission details.
6. Interpret the Document Check result.
7. Perform or identify the allowed feedback/review action.

### Teacher/Admin path

1. Sign in and select the intended workspace.
2. Locate a specified deliverable and its submission queue.
3. Identify missing/late/attention-needed work.
4. Open a target submission and Document Check.
5. Run or inspect AI Review where enabled and appropriate.
6. Determine the intended next action (feedback, acceptance, retry, etc.).

## 8. Google Form blueprint — first draft

### Section A — Consent and respondent profile

- Consent to participate in the IT411 MVP validation — required checkbox/yes-no.
- Full name — short answer, if identifiable evidence is required.
- Role — multiple choice with role branching.
- Program/course — short answer or dropdown.
- Year level — multiple choice.
- Section — short answer.
- CIT-U ID or institutional email — choose only one verification field unless instructor requires both.

### Section B — Validation setup

- Device used — Desktop/Laptop/Tablet/Phone.
- Browser used — Chrome/Edge/Firefox/Safari/Other.
- Have you used WildTrack before? — Yes/No.
- Were you able to open the assigned WildTrack page? — Yes/No.

### Section C — Role-specific task completion

For each assigned task:

- Were you able to complete the task? — Yes, without help / Yes, with help / No.
- If you needed help or could not complete it, what happened? — paragraph.
- How easy or difficult was this task? — 1 Very difficult to 5 Very easy.
- Optional approximate completion time — range or minutes, if not observed directly.

### Section D — ISO 9241-11 role-specific items

Use a 5-point Strongly Disagree -> Strongly Agree scale.

Effectiveness examples:

- WildTrack made it clear what I needed to do to complete my assigned task.
- I could tell whether my action was successfully completed.
- The information shown by WildTrack was sufficient for me to decide what to do next.

Efficiency examples:

- I could complete the task without unnecessary steps.
- WildTrack reduced the need to open or check information across multiple separate tools/pages. (faculty/admin)
- The submission process felt efficient. (student)

Satisfaction examples:

- The workflow was easy to understand.
- The labels, statuses, and feedback messages were clear.
- I would be comfortable using WildTrack for this capstone workflow.

### Section E — SUS

Insert the standard 10 SUS items unchanged, using the standard 5-point agreement scale. Keep SUS scoring separate from custom ISO/role items.

### Section F — Qualitative feedback

Required/open-ended:

- What was the most confusing or difficult part of using WildTrack?
- What part of WildTrack was most useful to you?
- What feature or information do you think is missing?
- Is there anything WildTrack currently does that should be changed or removed?
- What should definitely be retained in the next version?
- Please describe any error, unexpected behavior, or problem you encountered.
- Other comments or suggestions.

Faculty/admin additional:

- Compared with your usual capstone monitoring/review workflow, which steps did WildTrack reduce or simplify?
- Which steps still require too much manual work?

## 9. Google Sheet analysis plan

The linked response Sheet should preserve raw responses and add analysis tabs rather than editing Form-response columns directly.

Suggested tabs:

- `Form Responses 1` — raw linked data;
- `Cleaned Responses` — participant ID, role, normalized fields;
- `Task Metrics` — task success, assistance, optional time;
- `SUS Scoring` — per-respondent and aggregate SUS;
- `Role Summary` — Student vs Faculty/Admin metrics;
- `Qualitative Coding` — finding category, quote/summary, severity, proposed action;
- `Validation Findings` — VAL-001, VAL-002, etc. for Week 3 traceability.

## 10. Evidence folder structure

`WildTrack MVP Validation/`

- `01 Framework and Instrument/`
- `02 Deployed MVP Evidence/`
- `03 Participant Evidence/`
- `04 Interviews and Consultation Notes/`
- `05 Raw or Exported Results/`
- `06 Analysis and Findings/`
- `07 Final Submission PDFs/`

Do not stage fake validation screenshots. Capture evidence during real testing/communication.

## 11. Immediate blockers / decisions

1. Confirm framework approval path: who can approve ISO 9241-11 + SUS before formal deployment?
2. Verify the new IT411 Tracker import before using it in the live validation workspace.
3. Obtain/confirm current Team Formation, Tracker, and Software Project Monitor published Sheet sources and their current join keys.
4. Confirm whether `MID` in the new tracker means member number/order within a team.
5. Determine whether the old Team Formation / Project Monitor use the same `NEW TEAM CODE` values as the new IT411 Tracker.
6. Decide whether identifiable Form data will use Full Name + CIT-U ID, or Full Name + institutional email/course/year/section with less sensitive identification.
7. Recruit 30+ participants and identify who can help with a small observed subset.
8. Resolve or document the September 12 deadline vs September 14 target-customer meeting conflict.

## 12. Current technical tracker finding

Do not import the new IT411 Tracker into the final validation workspace yet. Current WildTrack code recognizes `NAME OF STUDENT`, `SECTION`, `NEW TEAM CODE`, and `ADVISER`, but presently misclassifies `No.`, `MID`, and `SOFTWARE TITLE` as tracker/deliverable columns. `MID` should likely map to Member Number, while `No.` and `SOFTWARE TITLE` should be metadata/ignored for deliverable generation. The importer needs a targeted compatibility fix and real-source verification first.
