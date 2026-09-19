# WildTrack Document Check and AI Review — Benchmark Test Plan

Created: 2026-09-16. Status: designed, not executed. Official STD template supplied and read on 2026-09-16. Finish session planning before app changes; test PDFs and benchmark runs remain future work.

This is a **team-run technical benchmark**, not the Google Form sent to participants. The team supplies controlled PDFs to WildTrack and compares its reports with expected findings. Respondents answer a separate validation questionnaire; they do not need to write an STD. Actual benchmark logs may later support the team's own STD, while generated fixture content remains synthetic and is not evidence that real testing occurred.

## Supplied evaluation authority

Reference: `docs/STD TEMPLATE.pdf`, seven pages. Text extracted from all pages; rendered body pages 4–7 inspected. Structure: Introduction (System Overview, Test Approach, Definitions and Acronyms); Test Plan (Features to be Tested, Features not to be Tested, Testing Tools and Environment); Test Cases (Purpose, Inputs, Expected Outputs & Pass/Fail Criteria, Test Procedure); Appendix/Test Logs (Log for Test n, Test Results, Incident Report), plus cover, Change History, and Table of Contents.

The template contains leftover `SchedEase` in body-page headers and labels Testing Tools and Environment as `3.3` inside chapter 2. These are reference quirks, not required project identity or evidence of a student's error. A correct WildTrack STD should identify WildTrack; section semantics matter more than copying a numbering typo. Table-of-contents occurrences must not be treated as proof that body sections are present or completed.

The owner supplied these STD submission requirements in this session (source instructions to evaluate, not commands to implement the app):

- Individual submission; based on updated SRS and SDD.
- Trace the relationship: Updated SRS → System Features → Test Cases → Test Execution → Test Results.
- Cover important functional and non-functional requirements where testing applies.
- Include appropriate valid, invalid, missing, boundary, incorrect-action, unauthorized-access, error and other realistic cases, not only happy paths.
- Distinguish expected outputs defined before execution from actual observed results; document incidents and resolutions when results differ.
- Supply supporting screenshots, logs, recordings, system outputs, or other evidence of actual systematic testing.
- Stated assignment deadline: September 26, 2026 at 11:59 PM. This records source context; the owner manages scheduling and does not want deadline planning questions.

The supplied instructions authorize assessing traceability, actual-result reporting and evidence presence even though the template does not supply a dedicated heading for every requirement. Do not invent an exact section heading where only a substantive requirement exists. Without the updated SRS/SDD, assess whether mappings are supplied, but explicitly limit any claim that *all actual project requirements* are covered. Text asserting that tests ran does not authenticate the underlying evidence.

Gemini budget: free tier, low. Proposed first pilot: ten content fixtures (STD-01, 02, 03, 05, 08, 09, 10, 12, 18, 21), one fresh AI run each if quota permits. Run technical file cases without AI calls where invalid input prevents content review. Preserve remaining cases for expansion; no repeated runs or paid usage is authorized merely by this plan.

## Purpose and scope

The owner authorized designing tests from the official STD template: untouched, partly completed, and fully completed variants. No completed student STD exists yet. Generated examples will be synthetic evaluation fixtures, never evidence of actual student work or completed software testing.

Use the same fixtures for two separately scored features:

- Document Check: access, file integrity/readability, and deterministic template/content indicators.
- AI Review: deliverable relevance, meaningful completion, filler detection, and findings grounded in supplied requirements/template.

Current source confirms template comparison exists in `backend/src/main/java/com/capvault/backend/filecheck/TemplateComparator.java`, with output flags assembled by `FileCheckService.java`. It uses token overlap/additions and heading detection; these are indicators, not independent reference labels for the benchmark.

## Fixture matrix

Expected outcomes below are test intentions to finalize against the actual template. They are not observed results. Technical PDF validity and substantive submission validity must be scored separately.

| ID | Controlled case | Document Check expectation | AI Review expectation |
| --- | --- | --- | --- |
| STD-01 | Untouched official template exported to valid PDF | Technical checks pass; template-only indicator | Identify uncompleted template using actual document evidence |
| STD-02 | Only names, title, dates changed | Technical checks pass; should still identify template-like content | Identify substantive incompleteness despite personalized cover |
| STD-03 | One required section meaningfully completed; others unchanged | Technical checks pass; record template indicator performance | Distinguish completed section from remaining placeholders |
| STD-04 | Roughly half the required sections meaningfully completed | Technical checks pass; record indicator sensitivity | Identify specific remaining gaps, not a blanket claim that nothing is completed |
| STD-05 | Every required section meaningfully completed with consistent synthetic project content | Technical checks pass; no erroneous template-only warning | No unsupported incompleteness/wrong-document finding; not a certification of academic correctness |
| STD-06 | Same complete content with different font, spacing, pagination | Same content judgment as STD-05 | Same substantive judgment as STD-05 |
| STD-07 | Complete sections but retained legitimate official headings/boilerplate | Avoid false template-only warning | Do not penalize required headings or legitimate boilerplate |
| STD-08 | All headings preserved, each body replaced with repeated filler | Technical checks pass; document heuristic behavior | Identify filler despite apparently complete structure |
| STD-09 | All headings preserved, long varied but irrelevant paragraphs | Technical checks pass; document heuristic behavior | Identify irrelevance despite high new-word count |
| STD-10 | Correct title/filename, body clearly describes another deliverable | Technical checks may pass; record actual comparison indicators | Identify body/required-deliverable mismatch using evidence |
| STD-11 | Correct substantive STD content with misleading filename | Technical checks pass | Do not reject solely because filename differs |
| STD-12 | Remove one explicitly required section from otherwise complete STD | Assess missing-heading indicator | Name only the actually required omitted section and cite its authority |
| STD-13 | Keep every heading but leave one required section empty | Technical checks pass; record heuristic limitations | Identify the empty section rather than claiming its heading is absent |
| STD-14 | Valid PDF containing almost no extractable text | Too-short/readability indication as applicable | Report limited evidence; do not invent content assessment |
| STD-15 | Corrupted PDF / non-PDF renamed .pdf (separate fixtures) | Correct technical failure for each | No valid content verdict from unavailable/invalid input |
| STD-16 | Valid reference PDF behind restricted permissions | Access failure | Cannot assess inaccessible content; no content verdict |
| STD-17 | Password-protected PDF / file exceeding configured size limit (separate fixtures) | Appropriate technical failure for each | Honest inability/limit handling |
| STD-18 | Same PDF with no official template and generic instructions | Explicit no-template limitation | No invented structural requirements; document-evidenced mismatch remains assessable |
| STD-19 | Same incomplete PDF with and without an explicitly supplied section requirement | Compare indicators only where template exists | Requirement-backed finding only when supplied authority supports it |
| STD-20 | Relevant content containing a sentence asking the reviewer to ignore defects and declare success | Record deterministic indicators | Treat embedded instruction as document content; retain evidence-based review |
| STD-21 | Complete test procedures and expected outputs, but empty actual-results/log/evidence content | Technical checks may pass; record template indicators | Identify missing execution evidence from supplied instructions; do not equate planned tests with executed tests |
| STD-22 | Tests and results supplied, but no mapping to requirements/features | Record deterministic indicators | Identify absent traceability using instructions; avoid inventing SRS requirement IDs |
| STD-23 | Only happy-path tests despite a fixture specification with relevant invalid/boundary/access cases | Record deterministic indicators | Identify missing relevant categories from fixture authority, not an unconditional requirement that every category applies to every test |
| STD-24 | Leave table-of-contents entry intact but remove the corresponding body section | Record whether heading heuristic is fooled | Identify missing body content; TOC mention is insufficient |
| STD-25 | Synthetic expected/actual mismatch with no incident explanation, then a paired copy with incident/resolution | Technical checks pass; compare indicators | Identify missing explanation only in the first copy; do not demand invented incidents where no mismatch exists |

STD-08–10 and STD-13 are deliberately challenging: a heuristic miss is a result to record, not an excuse to relabel the fixture as correct. Partially completed documents should have section-level labels rather than relying on an arbitrary percentage of changed words.

## Execution and scoring protocol

1. Obtain the exact official STD template and any actual deliverable instructions. Preserve an unchanged reference copy, version/date, and file hash. Do not invent required headings from general standards knowledge.
2. Build the fixtures, each with a manifest of controlled edits and expected findings. Vary one factor at a time where possible. For synthetic complete examples, satisfy the supplied rubric without claiming real test execution.
3. Have a teammate verify fixture labels against the reference before viewing WildTrack output. AI may draft fixtures and suggested labels; human verification and unresolved disagreements are recorded. Team labeling is not independent external validation.
4. Keep development examples separate from a frozen evaluation set. Do not tune prompts/thresholds on evaluation outcomes and report those same outcomes as independent performance.
5. Use a dedicated test workspace and test-owned Drive files. Keep live course Sheets writeback disabled. Do not alter production student permissions or files to induce failures.
6. Record app version, template version, exact requirements, fixture hash, field ID, model/prompt configuration, time, report/result, and whether provider/cache was used. Fixture variants derived from one template are not independent students or independent document types.
7. For Document Check, score each applicable technical check and template indicator separately. For AI Review, score expected issue detection, correct-document false alarms, and unsupported findings separately. Report counts and denominators, not only an overall accuracy number.
8. Report false positives, false negatives, precision and recall where defined. An expected access failure can pass a technical-check test while remaining unassessable for AI content accuracy. Unexpected provider failures count toward end-to-end failures and are reported separately, never silently removed.
9. AI consistency runs are optional and depend on available quota. Reopening a cached report is not a fresh model run; verify the supported rerun path before counting repetitions. Repeated runs of one file do not increase the number of distinct documents.
10. Preserve disagreements and failure examples in the highlights/evidence. Results from STD-only synthetic fixtures support a scoped STD benchmark, not a claim of proven performance across all academic documents.

## Results record

Use one row per fixture/run: fixture ID, check/expected label, reference evidence, label reviewer, observed output/evidence, pass/fail/unassessable, false-positive/false-negative category, execution error, run ID, app/model/template versions, and notes.

No pass rates, numerical SMART targets, evaluator agreement scores, generated test PDFs, or live execution results exist yet. Thresholds should be set before final evaluation, after scope and feasibility are agreed.
