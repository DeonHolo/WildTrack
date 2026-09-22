# WildTrack MVP Validation Framework and Model

**Status:** working **Markdown** Framework/Model source; no interim PDF exports, not adviser-endorsed. The Google Form and linked `Form_Responses` tab were already live when the owner approved a **post-distribution Goal 3 revision to initial saved records** on 2026-09-22; see `GOAL3_INITIAL_SUBMISSION_AMENDMENT_20260922.md`. Participant totals and actual new Goal 3 scores have not been retrieved. Goal 1 component and the separate Goal 2 follow-up remain unchanged.

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
| 3. Student initial saved response correctness **(revised after collection began)** | Does a selected genuinely eligible/consenting student's **initial saved Refactored SRS record** preserve the right student, Semester 1 workspace, deliverable, original saved response/version and stored PDF link/values? | correctness conditional on a saved record; not success over all attempts or student revision behavior | authenticated original-version/association/system evidence + restricted researcher log with true consent basis; observed student readback is supporting evidence; **not** the old Admin Study `overallPass` | `INITIAL_SAVED_CORRECTNESS = C_INITIAL / N_INITIAL`; proposed >=95% among selected initial SAVED records, with FAIL/UNVERIFIED separate; scope amendment and adviser approval pending |

### Technical result interpretation

**Objective 1:** The unchanged frozen technical component run matched 52 of 52 project-authored, AI-assisted expected labels across 25 synthetic STD families and 30 conditions (100% agreement; 100% scheduled classification coverage). Four conditions involve declared simulated Drive-gateway behavior. The original end-to-end objective was **not** demonstrated. Only the owner's later component-scope clarification places the existing result above the revised 90% numerical threshold; approval of that academic scope remains external. Evidence: `benchmarks/std/results/goal1-project-reference-r2-20260921/README.md` and the dated amendment.

**Objective 2:** The original ten-fixture v3 STD pilot recorded 7/10 (70%) project-reference decision agreement and 24/43 (55.8%) supported substantive claims; it did not meet the proposed 85%/90% pilot targets. A new, separately frozen fictional STD v6 follow-up recorded 10/10 one-shot attempts, nine fresh final reports and one HTTP 503 with unknown outcome, 9/9 (100%) matching checklist decisions on fresh final reports, and 10/11 (90.9%) source-supported claims with one unassessable narrative fragment. The two v6 **conditional** measurements reached the proposed thresholds for that **new cohort**; this does not turn the original v3 study into a pass or establish independent real-student accuracy. Evidence: `benchmarks/std/results/goal2-20260921/README.md` and `benchmarks/std-goal2-v6/results/goal2-v6-20260921/RESULT.md`. No further live Gemini calls are needed to prepare the MVP artifact.

**Objective 3:** The original T1/T2 protocol and temporary study display require revising the same response; many natural submitters have no reason to do so. The owner replaced that **after Form distribution** with initial **saved-record** correctness. No new percentage exists until actual consented eligible initial-version records are scored. The original old `Overall pass` is NOT the current metric, and a Google Form completion answer is not independently verified system evidence. An excluded/failed-before-save attempt is not represented by this conditional saved-record metric; the proposed >=95% scope and inclusion/consent rules still require course endorsement.

## Objective 3 current initial-saved-record model (post-distribution amendment)

Use the existing active **Semester 1** MVP Validation workspace and **Refactored SRS** form. Students may make a natural initial submission; they are **not required to simulate a rejected link or revise their submission**. Before selecting any data, document actual informed consent covering analysis of this record, a non-opportunistic inclusion rule, the version initially saved, and the difference between previously inspected versus newly reviewed records. Do not infer consent to research on unrelated natural submissions from the original optional controlled-task wording.

### Initial saved-record assessment

1. Select one authentic initial saved response/version per legitimately eligible consenting student under the dated inclusion rule; label any cases seen by the researchers before this amendment.
2. Verify canonical student association against a source independent of mere displayed name, correct Semester 1 workspace and Refactored SRS deliverable.
3. Verify a real initial persisted response ID and version and the original saved Drive PDF link/required values. Record actual student-visible readback **separately if it was observed**; do not require a new screenshot from students who already submitted. Do not infer the original version or a successful edit from the `Revised submission` dropdown alone.
4. Classify each required check PASS, FAIL or UNVERIFIED. A selected record passes only if every required check passes; selected incomplete-evidence records remain counted and disclosed as UNVERIFIED.
5. Report `C_INITIAL / N_INITIAL` conditional on initial SAVED records, not an end-to-end attempt success rate. Record observed rejected/abandoned/failed-before-save attempts separately where reliable evidence exists.

### Separate researcher-only technical tests

Use researcher-controlled permitted test accounts/synthetic files to check blank-PDF validation, actual DOCX/non-PDF handling under its configured pre-save/async policy, and revision/unchanged-value behavior when an edit actually occurs. These are not additional student participants, student goal passes or reasons to mark an initial-only student as a failure.

The original T1/T2 workflow was superseded **after** the distributed Form and old Sheet tabs were created. Archive that protocol intact rather than representing it as the current study or silently modifying existing questionnaire answers. See the dated Goal 3 amendment and new existing-Sheet tab replacement script. The questionnaire remains a separate descriptive evidence stream.

## Supporting questionnaire model

The Google Form gathers role-specific descriptive feedback only.

| Role | Supporting construct | Typical evidence |
|---|---|---|
| Student | status/save clarity and current workflow pain points | role-specific ratings + optional comments |
| Adviser | review information/action clarity and workflow pain points | role-specific ratings + optional comments |
| Admin/beneficiary | teacher/admin concerns about privacy, form management, document filtering and change visibility; separately identified user-experience preferences | Sir Ralph Laviste's September 14 consultation (sole planned Admin/beneficiary participant); optional genuine follow-up only if later collected |

**Admin/beneficiary participant and evidence unit.** The study owner identifies **Sir Ralph Laviste as the sole Admin/beneficiary participant** for this MVP validation. His **September 14, 2026 consultation transcript** is his existing qualitative Admin/beneficiary contribution, rather than a missing Admin Google Form response. He also speaks as a teacher/adviser, potential beneficiary and prospective user, distinguishing his instructional/security concerns from preferences based on Google Forms familiarity. These are *multiple perspectives of one person*, **not multiple participants**. The transcript labels this speaker `Adviser`; the participant's name and sole-Admin study role are established by the study owner's identification, not by a fabricated additional form submission. See `docs/TRANSCRIPT CAPSTONE 2.md`, Part 01, lines 125-131, and Part 06, lines 455-470. If the same person later supplies an actual follow-up, keep its date and source separate; do not count him again.

**Consultation-derived input to the evaluation model (not a post-implementation acceptance test):**

| Consultation theme | Speaker's documented point | Evidence and methodological treatment |
|---|---|---|
| Form-builder workflow and familiar controls | As a prospective user, he describes limited room to configure the demonstrated form and favors familiar Google Forms-style assembly with field types such as dropdowns, open text and lists. He explicitly clarifies that his preference is **not a demand** that the team implement an exact copy. | `docs/TRANSCRIPT CAPSTONE 2.md`, Part 02, lines 149-168; Part 06, lines 455-459. Record as an early user/beneficiary preference informing Form Editor requirements; verify later revisions separately. |
| Student identity and privacy | He objects to arbitrary student-number lookup exposing student status and suggests linking an authenticated Google account to one student record, with restricted access to that record and without an unnecessarily burdensome OTP step. | Same transcript, Part 02, lines 180-201 and 209-213; Part 03, lines 220-226. Record as a teacher/admin privacy and access-control requirement, **not** as independent proof that current production security has been audited. |
| Submission-document validation | He values technical PDF/access/readability checks but stresses that filename or matching template headings cannot establish that an SRS is actually an SRS or that a template contains meaningful content. He distinguishes filtering submitted content from assigning a grade for academic correctness. | Same transcript, Part 04, lines 285-304, 319-323 and 343-346; Part 05, lines 354-383 and 391-405. This motivates bounded source-grounded screening, not a claim that the 52-assertion Goal 1 component benchmark measures semantic truthfulness. |
| Submission changes and document provenance | He raises the scenario of empty pre-deadline templates edited later, asks about document author/editor information, and wants submission/version dates and available Drive metadata visible without manually inspecting every file. | Same transcript, Part 04, lines 310-315; Part 05, lines 405-431. Record the requested visibility separately from what Google Drive actually makes available through the deployed authorization and what WildTrack has independently verified. |

This consultation predates later features and the current student saved-response assessment. It informs requirements and the qualitative evidence stream; **it neither establishes a numerical SMART-goal score nor constitutes Sir Ralph's approval of later implementations**. The final Highlights should compare each theme with dated implementation/readback evidence and report any unresolved gaps rather than attributing a later test verdict to him.

### Traceability: goal, construct and questionnaire item

| Primary goal/construct | Primary scoring method | Supporting respondent route and actual question/field |
|---|---|---|
| Goal 1 - deterministic Document Check component classification | Frozen project-reference 52-assertion benchmark; **no survey item scores this** | Student: `Which parts of the student workflow that you actually used or saw should be improved?` includes Document Check information; optional student comment provides context only. |
| Goal 2 - grounded AI Review | Distinct frozen technical pilot decision/claim audit; **no survey item scores this** | Adviser: exposed review features and areas to improve, including available AI Review information; Admin/beneficiary: review/exposure questions if answered. Student route must not assume AI Review explanations are student-visible. |
| Goal 3 - initial saved record correctness (revised) | Eligible, consented initial-version Refactored SRS system evidence + separately reviewed v2 log; **no survey item scores this** | Student: current status-clarity 1-5 and post-save-clarity 1-5 remain descriptive. **“After submitting OR editing” includes students who only submitted.** Adviser feedback is only an optional improvement choice for students who actually received/saw feedback; absence is not an assessment of an unseen feature. |
| Overall MVP workflow evaluation | Counts, role-specific distributions and de-identified qualitative themes, separate from the three goal scores | Student, adviser and Admin/beneficiary questions about features used, clarity, current pain points and optional written comments. No-use and decliner paths do not contribute role-specific ratings. |

The respondent-facing Google Form and linked response spreadsheet already exist. Do **not** create a replacement form, alter its question order while collecting, or overwrite its original `Form_Responses` tab. Anonymous response rows cannot by themselves prove 30 **unique** consenting people; report the actual deduplication limitation.

## Evidence separation

```text
Objective 1 -> frozen project-defined Document Check component evidence; scope clarified after the run
Objective 2 -> AI Review fresh-run fixture evidence
Objective 3 -> Student initial SAVED record + true consent/version/readback evidence (revised after initial survey distribution); researcher technical tests separate
Questionnaire -> Supporting role feedback only
Consultation -> Real qualitative Admin/beneficiary evidence
```

This separation prevents opinion ratings from being misreported as technical accuracy or transaction correctness.

## Sample and privacy boundaries

- Planned validation includes at least 30 unique consenting stakeholder participants across the role mix defined in the research packet. Sir Ralph is the **one planned Admin/beneficiary**, represented by his real September 14 consultation; students and 1-2 advisers contribute separately. This is the owner/course plan, not a direct Sir Ralph quotation. Whether the consultation counts toward the final consenting-unique total must be supported by the study's applicable consent/eligibility record; do not add an invented Form row or count one person twice.
- Questionnaire email collection is off under the preferred settings. Do not recreate the respondent-entered participant code.
- Objective 3 may require restricted Student Number/internal record keys to verify canonical response ownership. Use pseudonymous `observation_id` in cleaned analysis and final reporting; existing optional controlled-task consent must not be silently broadened to all naturally occurring records.
- No student submits binary files to WildTrack; the original and revised workflows use Google Drive PDF links.
- Raw participant/task evidence stays access controlled and should not be committed as ordinary repository content.

## Approval and completion boundaries

- GQM and the owner's post-benchmark Goal 1 component-scope clarification remain subject to course-required adviser/framework endorsement.
- The component run's 52/52 matching classifications meet the clarified numerical target **within that project-defined scope**; this is not independent accuracy or a retrospective pass of the original broader end-to-end objective. Do not claim participant or Goal 3 success before collection.
- Live Google Drive delegated history is separate from these three research denominators; verify deployed consent/history behavior from actual role-specific evidence if it is discussed as an MVP feature.
- Final Highlights must report actual denominators, failures, exclusions and limitations rather than only whether a target was met.
