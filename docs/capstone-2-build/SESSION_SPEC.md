# Capstone 2 session implementation specification

Status: ready-for-agent. Scope authority: DECISIONS.md. Local tracker: .scratch/capstone-2-session/issues.

## Problem Statement

The consultation exposed gaps in academic setup, form configuration, account association, deadline tracking and evidence for evaluating the existing checkers. The team needs a usable validation instrument first, followed by coherent product improvements and honest evidence, without replaying the entire conversation after a model/session interruption.

## Solution

Deliver the research instrument before app work, then implement bounded end-to-end tickets. Keep shared backend data and existing imports, add familiar form/data editing, enforce account binding, track meaningful submission changes, and test the checkers against controlled PDFs. Maintain a resumable evidence ledger. External OAuth authorization and real respondent data are independent prerequisites, not reasons to stop unrelated work.

## User Stories

1. As the researcher, I get three measurable SMART objectives and a justified evaluation mapping first.
2. As the researcher, I can copy complete questionnaire wording into Google Forms without inventing missing options or routing.
3. As a participating student, I complete a short controlled WildTrack submission/revision task whose correctness is verified from system evidence, then answer only relevant current-workflow feedback questions.
4. As an adviser/Admin respondent, I evaluate my own workflow rather than answer student-only questions.
5. As a respondent, I can decline participation and avoid questions about features I have not used.
6. As the researcher, I have scoring rules, denominators, a codebook and a small pilot checklist before collection.
7. As the researcher, I keep technical accuracy evidence distinct from respondent opinions.
8. As Admin, I use a full-page configurable form editor (see EDITOR_SPEC).
9. As Admin, I type, paste or import academic records into the same spreadsheet-like workspace.
10. As Admin, I see required columns, cell errors and duplicate identities before a save.
11. As Admin, I preview re-import differences and choose how to resolve conflicts.
12. As a student, my first successful submission binds my account, and a competing account cannot overwrite it.
13. As a returning student, the same association carries across semesters without exposing unrelated workspaces.
14. As Admin, I can disconnect/recover an incorrect account association and retain an audit trail.
15. As a student, an unchanged resave does not make my submission late.
16. As staff, I see lateness based on actual relevant changes, with the contributing timestamps explained.
17. As staff, I see document observations and available editor metadata without invented history/authorship.
18. As an authorized file user, I may connect Drive for older history while keeping pasted-link submission.
19. As a user without history access, I can still submit and see an explicit history limitation.
20. As Admin, I decide acceptance; checkers remain advisory.
21. As the researcher, I evaluate untouched/partial/filler/complete PDFs using frozen expected findings.
22. As the researcher, I preserve failures and quota errors instead of overstating accuracy.
23. As the researcher, I later assemble real findings/evidence and trace them to requirements/design.
24. As the next agent/model, I resume the next unfinished slice from files rather than memory.

## Implementation Decisions

- Research package is Ticket 01 and is runnable against the current MVP. Objective 3 uses the existing imported MVP Validation workspace plus a frozen controlled student task; do not create a second synthetic validation workspace, and do not replace the task with a fictional scenario quiz.
- Selected third goal is student submission transaction correctness. The current proposed working target is at least 95% correct scored transaction tasks across the frozen initial-submission and material-revision protocol; freeze the number before collection and do not claim adviser endorsement.
- Student questionnaire ratings are supporting MVP feedback only. Do not use them to score Objective 3, and do not require respondent-facing research codes or a self-created participant code.
- Ticket 01 proposes and documents concrete targets/case counts for Document Check and AI Review before final evaluation; do not present arbitrary targets as published standards. Freeze scoring before collection.
- Use a goal-led evaluation mapping; research appropriate primary sources rather than treating SUS as one of the three goals. Opinion questions support findings; they do not prove accuracy.
- Academic data views use normalized backend entities, stable identities, scoped authorization, cell validation, transactional bulk save and stale-version handling. Import preview is read-only until confirmed.
- One global/canonical person association across workspaces, with scoped membership. Audit existing identities before migration. Existing conflicts go to Admin resolution, not automated winners.
- First binding + successful submission form one transaction. Include concurrent first-claim tests and account-disconnect behavior for existing response editing. No mandatory OTP/precollected emails.
- Effective submission time accounts for material artifact changes and verified relevant file changes while keeping original timestamps. Capture content identity when possible; no-op saves remain unchanged.
- History has two labeled sources: recorded WildTrack observations and, only when separately authorized later, Drive revisions. Do not merge duplicate events, infer missing editors, or map provider identity to roster names as proof of authorship.
- Optional Drive integration must preserve pasted-link UX. A feasibility/access record chooses a justified scope, tests role restrictions and details secure token handling. Real owner grants are external actions.
- AI prompt grounding, artifact identity, no-template limitations and Admin-only invocation remain. Make checker changes only from reproducible fixture failures.
- Benchmark fixtures are synthetic test inputs; logs of actual runs are evidence. Final study analysis uses actual participant data only.
- All product work preserves current data and migration compatibility. No wholesale architecture rewrite or Google writeback.

## Testing Decisions

- Deliverable editor/public response API contract tests plus desktop/mobile browser behavior.
- Academic grid save/import preview API tests with blank cells, reordered headers, duplicate IDs, new teams, stale saves, partial failures and local-edit conflicts.
- Account binding/recovery API and transaction/concurrency tests covering malicious alternate account, unknown student, cross-workspace access and existing duplicate claims.
- Timestamp tests covering no-op, changed one artifact, same-link PDF replacement, metadata-only change, unavailable Drive data, timezone/deadline boundaries and all three role views.
- Provider/mock tests for auth denial, missing revisions/email, revocation and quota; live credential verification only when authorized.
- Grounded checker benchmark with technical/content outcomes separately counted.
- Final targeted suites, full affected suites and build once after integration; reproduce historical failures before calling them pre-existing.

## Out of Scope

Automatic live Sheets writeback/polling; paid Gemini upgrades; fabricated study results; automatic academic acceptance; guaranteed complete Drive history; publication/deployment; remote issue creation; copying all Google Forms features; redesign of unrelated app surfaces.

## Further Notes

Ticket 11 can prepare framework/evidence/traceability artifacts immediately after 01, but real Highlights analysis remains pending actual data. Ticket 09 can finish feasibility/preparation while live OAuth verification remains blocked. Ticket 12 reports local completion and unresolved external acceptance separately. Do not mark the whole project complete merely because local code builds.
