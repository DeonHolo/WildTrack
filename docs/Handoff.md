TASK



Continue local development and MVP-validation preparation for WildTrack/CapVaultV2 at `/capvaultv2`.



The immediate unfinished coding task is to finish the frontend test cleanup for the semester-aware Google Sheet importer refactor, then run final build/diff/writeback-safety verification before creating the real MVP-validation workspace.



The broader goal is to make WildTrack stable enough to conduct MVP validation against Sir Ralph Laviste’s real current-semester Google Sheets while keeping WildTrack in “parallel play” with Sir’s real Google Forms/Sheets workflow, then produce the five required MVP-validation deliverables.



IMPORTANT CURRENT TOOL STATE



The old conversation is broken/stuck in Compact \& Resume.



The latest actual repo attempt was:



git status --short

git diff --stat

git diff --check



from `/capvaultv2`.



It was REJECTED before execution with:



COMPACTION\_IN\_PROGRESS: this chat is being compacted into a fresh chat, and no local tool was run. Nothing will run here until the handoff is done. Make no further tool calls of any kind. The latest user message asks for the handoff brief: write that brief now, as plain text, and then stop. Work continues in the replacement chat.



So NOTHING changed from that attempt.



The user should paste this entire handoff into a completely new normal chat and continue there rather than trying Compact \& Resume again on the broken session.



The Compact \& Resume Activity UI also showed repeated errors resembling:



no valid metadata projection; refusing to treat it as an empty session



This appears to be why the continuation session never becomes valid and why every tool call in the old chat remains locked.



Do not waste more time trying tools in the broken chat.





USER SPECIFICATION



PROJECT HISTORY



\- Current project name: WildTrack.

\- Earlier project/docs used the name CapVault.

\- The original project proposals were repeatedly denied until the last part of the semester.

\- The team had around one week left to build a new prototype after Sir Ralph gave them the current project idea.

\- There is no accepted current proposal/SPMP/SRS/objective document that accurately represents current WildTrack.

\- Old CapVault SRS/SDD exist, but current WildTrack has changed substantially.

\- The old docs can be used as historical/baseline lineage, but they are not authoritative current requirements.

\- Do not pretend the old SRS/SDD describe the current product.

\- Week 3 should eventually produce new/refactored WildTrack SRS, SDD, SPMP based on:

&#x20; - actual implementation,

&#x20; - MVP-validation evidence,

&#x20; - Sir Ralph/stakeholder feedback.



Important old docs:

\- docs/SRS (2526-sem2-it332-41) (CapVault)...

\- docs/SDD (2526-sem2-it332-41) (CapVault)...



They were inspected earlier. The old SRS included ideas like:

\- capstone tracking,

\- student/adviser/admin roles,

\- Google auth,

\- Sheets imports,

\- submissions,

\- review,

\- versioning,

\- archive/retrieval,

but the current app evolved far beyond the original architecture.



MVP VALIDATION



User needs to complete the MVP validation activity first.



The LMS screenshots show five required outputs:



1\. Google Form — Validation Instrument

2\. PDF — Validation Framework / Model

3\. Google Sheet — Validation Responses

4\. PDF — MVP Validation Highlights

5\. Google Drive Folder — Validation Evidence



The instructions emphasize:

\- instrument aligned with selected research/evaluation framework;

\- instrument addresses SMART objectives/measurable outcomes;

\- respondent-specific questions are allowed;

\- open-ended qualitative questions required;

\- framework PDF must identify/explain the framework;

\- justify framework appropriateness;

\- map SMART objectives to evaluation criteria/constructs;

\- group questionnaire items by objective;

\- identify respondent/user type for questions;

\- linked Google response Sheet;

\- Highlights PDF should focus on meaningful insights, not just response counts;

\- identify problems, feature improvements, missing/additional requirements, suggestions, positive aspects, and changes before full implementation;

\- evidence folder may include deployed MVP screenshots, testing photos, participation proof, interview notes, meetings/consultations, invitations/communications.



Course flow file:

\- docs/it411\_capstone\_2\_midterm\_flow.md



Persistent project notes already created:

\- docs/WildTrack\_MVP\_Validation\_Progress.md

\- docs/WildTrack\_MVP\_Validation\_Worksheet\_Draft.md



Read those files in the new chat before rebuilding validation plans.



Deadline shown:

September 12, 2026 | 11:59 PM



However:

\- Sir Ralph’s next meeting is Sep 14, 2026.

\- User believes they likely cannot honestly complete Sir feedback before Sep 12.

\- Do NOT fabricate stakeholder feedback or pretend approval happened earlier.



SIR RALPH MEETING HISTORY



User gave this history:



1\. First meeting:

&#x20;  - Sir Ralph gave them the initial project idea.



2\. Second meeting:

&#x20;  - presentation day.

&#x20;  - team built project without guidance.

&#x20;  - Sir basically told them “good job doing your best despite not having his guidance.”



3\. Third meeting:

&#x20;  - summer-class progress check.

&#x20;  - Sir saw current WildTrack progress.



4\. Next meeting:

&#x20;  - Sep 14, 2026.

&#x20;  - this will be the fourth meeting.

&#x20;  - intended for feedback/progress validation.



DEPLOYMENT / RESPONDENTS



User confirmed:

\- WildTrack is publicly deployed already.

\- All current features can be tested during validation.

\- They hope to get around 30 respondents.

\- Exact respondent role split unknown.

\- User is unsure if teammates can personally observe/timestamp respondents.

\- Observation of every participant is NOT required by the instructions.

\- Optional observed usability sessions are useful, but should not block the validation.

\- No evaluation framework is mandated yet.

\- They can likely ask Sir Ralph for framework guidance.

\- They have NOT created the validation Google Form or Drive folder yet.

\- Start from scratch.



RESPONDENT IDENTITY FIELDS



User explicitly questioned why names might be omitted and prefers proving respondents are CIT-U students/stakeholders.



Likely raw Form fields should include:

\- Full Name

\- Role

\- Program/course

\- Year Level

\- Section

\- CIT-U ID Number



Do not remove these against the user’s preference.



Recommended reporting distinction:

\- raw response Sheet/evidence may contain identity;

\- Highlights PDF can anonymize quotations/findings with P01/P02 etc.



EVALUATION FRAMEWORK STATUS



Discussed recommendation:

\- Primary: ISO 9241-11

\- Support:

&#x20; - task-success rate/effectiveness

&#x20; - time-on-task/efficiency where feasible

&#x20; - SUS

&#x20; - qualitative open-ended questions

&#x20; - follow-up interviews with Sir/faculty



This is NOT yet approved by Sir.



Draft SMART targets were proposed but were NOT clearly approved by the user:

\- ≥90% student submission task success

\- median submission workflow ≤3 minutes once valid Drive link exists

\- possible ≥30% faculty monitoring improvement vs manual workflow

\- ≥90% staff review task success

\- SUS ≥68



Do NOT treat these numbers as final.



The old CapVault SRS had historical targets such as:

\- \~30% reduction in adviser status-checking time

\- \~40% archive retrieval improvement

but those are historical inspiration, not binding current goals.





LIVE GOOGLE SHEET SOURCES



TEAM FORMATION



https://docs.google.com/spreadsheets/d/1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk/edit?gid=1639014359#gid=1639014359



Treat as Capstone 1 historical/supporting identity/roster source.



CURRENT IT411 TRACKER



https://docs.google.com/spreadsheets/d/e/2PACX-1vRFg8ywqAf3XK2rIQJaGXHQnmpl9Z4xhwJ5P8NkhEg7FaauPGNnLn7tb-sJ5KMJFU9IHycMoViEHvpL/pubhtml?gid=1793251618\&single=true



Actual current header shape found from the live Sheet:



No.

NAME OF STUDENT

STUDENT NO.

SECTION

NEW TEAM CODE

MID

ADVISER

SOFTWARE TITLE

MVP Validation

Refactored SPMP

Refactored SRS

Refactored SDD

STD



Bottom row:

SUBMISSION DEADLINE



with per-deliverable dates.



User says MID probably means Member ID.



SOFTWARE PROJECT MONITOR



https://docs.google.com/spreadsheets/d/e/2PACX-1vS01I-ERT-9M0I5O0TDyFKFrhARge3kyRcjqKpB4xkUZczo-JS3PaeXTcT78JpW0uLlafzljGIBDJxX/pubhtml?gid=1174022967\&single=true



Treat as Capstone 1 historical/supporting project metadata.





LOCKED SOURCE-AUTHORITY DECISIONS



User explicitly confirmed all four:



1\. CURRENT TRACKER IS AUTHORITATIVE for current Capstone 2:

&#x20;  - current team code

&#x20;  - section

&#x20;  - MID/member number

&#x20;  - adviser

&#x20;  - software title

&#x20;  - current deliverables

&#x20;  - deadlines

&#x20;  - current tracker state



2\. OLD TEAM FORMATION + SOFTWARE PROJECT MONITOR ARE HISTORICAL/SUPPORTING.

&#x20;  - keep old codes;

&#x20;  - do not rewrite historical source data just to match current semester codes.



3\. MVP VALIDATION MUST USE ONE DELIBERATE SNAPSHOT.

&#x20;  - no periodic Google Sheet polling;

&#x20;  - no automatic re-import;

&#x20;  - no test progress syncing back into Sir’s tracker.



4\. FIX IMPORTER/RECONCILIATION FIRST.

&#x20;  - user said validation cannot start until all discussed importer crap is fixed.



PARALLEL PLAY — CRITICAL



User corrected a prior assistant proposal for periodic Sheet checking.



WildTrack is still only a capstone MVP.

It is NOT yet embedded in Sir Ralph’s real production workflow.



Sir’s Google Forms/Sheets are still the actual operational workflow.



WildTrack validation runs separately.



Example user concern:

\- student submits to WildTrack test on one day;

\- student submits to Sir’s actual Form on another day;

\- tracker lateness/status values would differ;

\- automatic syncing would create conflicting numbers.



Therefore validation architecture must be:



Sir’s Google Sheets/Forms

&#x20;   ↓ manual one-time import

READ-ONLY REFERENCE SNAPSHOT

&#x20;   ↓

WildTrack MVP validation workspace

&#x20;   ↓

test submissions/reviews/document checks/AI/acceptance

&#x20;   ↓

WildTrack DB only



DO NOT:

\- periodically poll Sir’s Sheet;

\- re-import every 10–15 minutes;

\- auto-write validation results into Sir’s tracker;

\- act as if WildTrack owns his workflow.



NOTE:

frontend/src/hooks/useWorkspaceResource.js has a 15-second refresh of WildTrack BACKEND data.



This is not Google Sheet polling.



Do not remove it merely because Google polling is rejected.





DELIVERABLE IDENTITY — CRITICAL CORRECTION



User explicitly corrected the assistant:



SRS and Refactored SRS are NOT the same deliverable.



Refactored SRS is a separate later milestone.



Never model:



SRS → Refactored SRS



as an automatic rename/replacement.



Same principle applies to original/refactored project artifacts generally.



Current Tracker should classify only these as current deliverable columns:



MVP Validation

Refactored SPMP

Refactored SRS

Refactored SDD

STD



Metadata/non-deliverable headers:



No.

NAME OF STUDENT

STUDENT NO.

SECTION

NEW TEAM CODE

MID

ADVISER

SOFTWARE TITLE





CROSS-SEMESTER TEAM CODES



User confirmed:

\- Team Formation and SPM still use old Capstone 1 team codes.

\- Current Tracker uses new current-semester team codes.



Likely long-term Sir workflow:

Capstone 1:

\- Team Formation

\- Software Project Monitor

\- Tracker



Capstone 2:

\- only Tracker is updated/replaced for the new semester/year



System therefore must handle old-vs-current team-code lineage.



Correct conceptual model:



Student Number = stable identity



Old Team Formation code = historical source membership



Current Tracker team code = operational current team



Old SPM group code = historical project-source identifier



Current project/team views should still be able to surface old SPM metadata through lineage.



Previous live comparison reported:



Team Formation:

318 students



Current Tracker:

303 students



299 / 303 current Tracker students match old Team Formation by Student Number.



Those matches cover:

62 current teams



All 62 mapped unambiguously to one old team.



0 ambiguous mappings were reported.



4 unmatched current students:

all belong to `2627-sem1-it411-65`



This strongly suggests Team 65 is genuinely new.



Example lineage:

old:

2526-sem2-it332-41



current:

2627-sem1-it411-41



Do not rely on the numeric suffix alone.

Use Student Number overlap/identity.





FUTURE TRACKER FORMAT CHANGES



User asked how WildTrack can survive future header changes/new deliverables.



Desired behavior:

\- importer should not rely on fixed column positions;

\- map by normalized header aliases/semantics;

\- MID recognized as member number;

\- No. ignored/metadata;

\- SOFTWARE TITLE is project metadata;

\- unknown header is NOT automatically a deliverable;

\- deadline row provides strong evidence for a deliverable;

\- new deliverables can be discovered on manual re-import;

\- removed tracker columns should become inactive/historical, not hard-deleted;

\- no automatic destructive rename inference;

\- no automatic form publication merely because a new header appears;

\- no automatic Google polling during MVP phase.





EXPECTED VALIDATION WORKSPACE



Suggested name:

IT411 2627 SEM1 — MVP Validation



Import order:



1\. old Team Formation

2\. old Software Project Monitor

3\. CURRENT IT411 Tracker



Verify after import:

\- 303 active/current students

\- approximately 63 current teams; verify exact count

\- exactly 5 current tracker/deliverable columns

\- deadline row recognized

\- 299 old identities reconciled

\- Team 65 treated as new

\- Team Formation-only historical students not exposed as current

\- no Google writeback





REPOSITORY STATE



Repo root:

`/capvaultv2`



Native path seen in test output:

`D:\\SchoolStuff\\College Stuff\\3rd Year College BSIT\\Second Semester\\IT332 (Capstone)\\CapVaultV2`



Expected dirty tree contains desired uncommitted changes from multiple tasks.



DO NOT broad reset/revert.



No combined commit has been verified.



No deployment of the latest combined local changes has been verified.



The public site likely still runs an older committed version unless user separately deployed it.





EARLIER COMPLETED FIXES — DO NOT REVERT



AI REVIEW ALL RETRY BUG



Observed:

\- AI Review All would fail/error around an uncertain previous Gemini request.

\- Individual Retry button worked.



Root:

\- batch path did not send per-response retry acknowledgement/token;

\- individual path did.



Backend AiReviewStore only reclaims uncertain jobs if expected retry token matches.



Implemented:

\- per-response retryTokens in batch;

\- mixed batch works with fresh/cached/retry-required responses;

\- retry warning in dialog.



Previously verified:

reviewDeskClient 11/11 pass

AiReviewDialog 6/6 pass

WorkspacePage 20/20 pass

targeted ReviewPage mixed retry regression pass

frontend build pass

diff check pass



Full ReviewPage still had 4 old unrelated stale failures around removed “Deliverables awaiting review” UI.



Do not confuse those with importer work.





WORKSPACE TEMPLATE SAVE BUG



Observed:

“Save template” appeared dead in Upload tab.



Cause:

inactive Google Drive tab remained mounted with required HTML field.

Browser native validation blocked submit before application handler ran.



Fix:

inactive source controls unmounted/scoped.

Drive required only in Drive mode.



Previously verified via WorkspacePage tests.



Do not reintroduce hidden required fields.





GITIGNORE



Keep:



.agents/

.codex/

AGENTS.md





AUTH SESSION



User approved persistent login around 90 days.



Implemented:

\- custom WildTrack session TTL 90 days absolute

\- production cookie domain `wildtrack.dev`

\- secure-cookie true

\- P90D config

\- Java fallback 90 days

\- logout clears same-domain cookie



Not rolling.

Existing sessions need new login to receive full new expiry after deployment.



Relevant auth/security tests previously:

20 passed, 0 failed.



Do not revert.





SEMESTER-AWARE IMPORTER IMPLEMENTATION ALREADY DONE



BACKEND



Substantial implementation already exists.



Student model:

\- current operational `teamCode`

\- historical `teamFormationCode`

\- current/inactive roster semantics



Project metadata:

\- effective/current group code

\- historical/source group code

\- effective software/adviser context



Tracker importer:

\- recognizes software title separately

\- recognizes row-number metadata

\- MID alias added

\- identity + metadata excluded from deliverables

\- Student Number-first matching

\- current team promoted from Tracker

\- Team Formation lineage preserved

\- old SPM metadata reconciled to current team

\- current roster vs historical inactive rows

\- removed tracker columns retained historically/inactive on later imports

\- shared SPM filtering to known workspace cohort



Relevant migration:

backend/src/main/resources/db/migration/V19\_\_semester\_tracker\_context.sql



Do not add conflicting schema migration without reading V19.





FRONTEND FALLBACK IMPORTER



frontend/src/lib/devPublicSheetImport.js



Updated to mirror current/historical reconciliation.



One regression initially caught this bug:



Expected old institutional email:

ronluigi.taghoy@cit.edu



Actual after reconciliation:

""



That was patched.



Latest dedicated importer regression is GREEN:



Command:

cd frontend

npm test -- --run src/lib/workflow.test.js -t "treats current IT411 metadata as metadata and reconciles old Team Formation codes by Student Number"



Result:

1 passed

12 skipped



Do not undo institutional-email preservation.





BACKEND TESTS ALREADY GREEN



These passed after semester-aware work:



SheetImportControllerTest

StudentAssociationServiceTest

StudentIdentityConflictControllerTest

StaffManagementServiceTest

FormResponseServiceTest



Backend compile also passed in the prior run.





FRONTEND BUILD



A previous production build passed:



Vite 6.4.3

5402 modules transformed

build succeeded



Only warning:

chunks >500 kB after minification



This is not a blocker.



However, final build should be rerun after test cleanup.





IMMEDIATE UNFINISHED TEST CLEANUP



1\. AdviserViewPage.test.jsx



Correct command previously run:



cd frontend

npm test -- --run src/pages/AdviserViewPage.test.jsx



Result:

13 tests

13 failed



All failed because page stayed on:

Loading data



Normal expected controls were absent:

\- Check ... unchecked member response

\- TEAM\_A button

\- Current group output

\- Feedback for student

\- Accept group output

etc.



Rendered DOM consistently showed:

\- My advised teams heading

\- Search assigned teams input

\- Loading data status



The test ALREADY mocks:



../app/WorkspaceSession.jsx



../hooks/useWorkspaceResource.js



../lib/reviewDeskClient.js



The useWorkspaceResource mock returns:

data: workflow.state

status: ready

error: ""



So that resource is not the likely problem.



HIGH-CONFIDENCE ROOT CAUSE



AdviserViewPage.jsx also now uses:



const {

&#x20; data: staffIdentity,

&#x20; status: identityStatus,

&#x20; error: identityError,

&#x20; reload: reloadIdentity

} = useStaffIdentity();



from:

../app/StaffIdentity.jsx



The Adviser test as inspected did NOT mock StaffIdentity.



Likely the real identity hook remains loading in the test, causing ResourceBoundary/loading state.



NEXT AGENT SHOULD FIRST READ:



frontend/src/app/StaffIdentity.jsx



lower section of:

frontend/src/pages/AdviserViewPage.jsx



top/mocks of:

frontend/src/pages/AdviserViewPage.test.jsx



Then confirm `identityStatus` is causing loading.



Likely test mock should return something like:



data: {

&#x20; assignments: \[

&#x20;   {

&#x20;     workspaceId: "workspace-it",

&#x20;     teamCode: TEAM\_A

&#x20;   }

&#x20; ]

}

status: "ready"

error: ""

reload: vi.fn()



Use exact production shape after inspection.



Fixture constants in test:



const TEAM\_A = '2526-sem2-it332-01';

const TEAM\_B = '2526-sem2-it332-02';



createState() contains:

\- two TEAM\_A students

&#x20; - adviser Dr. Elena Mercado

\- one TEAM\_B student

&#x20; - adviser Prof. Adrian Flores



Important:

do NOT change production Adviser UI just to make tests pass until StaffIdentity mock issue is confirmed.



Once patched, rerun full:



npm test -- --run src/pages/AdviserViewPage.test.jsx





2\. StudentStatusPage.test.jsx



Two targeted stale failures.



Command previously run:



npm test -- --run src/pages/StudentStatusPage.test.jsx -t "explains roster load failures|shows a workspace load error"



Result:

2 failed

26 skipped





FAILURE A



Test:

“explains roster load failures and lets the student retry”



Old expectation:

heading `Student records are not available yet`



Current StudentStatusPage behavior:



if (dashboardStatus === 'error')

&#x20; return DashboardContainer + ResourceBoundary



Actual DOM:

\- alert containing:

&#x20; The roster service is unavailable.

\- Try again button

\- no old custom heading



Likely test is stale.



Likely fix:

\- remove old heading assertion

\- assert alert/error text

\- click Try again

\- verify refreshBackendData or the exact mocked refresh call



Do NOT resurrect obsolete heading just to satisfy test.





FAILURE B



Test:

“shows a workspace load error with a retry instead of cached options”



Fixture sets:

workspaceCatalogStatus = 'error'

workspaceCatalogError = 'Workspaces are temporarily unavailable.'



Old test expected:

Workspace combobox not present



Current component only forces standalone Choose Workspace error path when:



(workspaceCatalogStatus === 'error' \&\& !activeWorkspaceId)

|| !workspaces?.length

|| needsWorkspaceChoice



If activeWorkspaceId exists:

\- current cached workspace remains known;

\- Workspace picker stays available;

\- error can still be surfaced with retry.



Actual DOM contained Workspace select.



Likely current product behavior is preferable:

keep active workspace/picker when catalog refresh fails.



Likely test change:

\- assert error alert

\- assert Workspace picker remains present

\- click Try again

\- verify refreshWorkspaceCatalog called



Again:

patch stale test, not production UI, unless inspection reveals a real UX contradiction.





RELEVANT FILES



Immediate test cleanup:



frontend/src/app/StaffIdentity.jsx

frontend/src/pages/AdviserViewPage.jsx

frontend/src/pages/AdviserViewPage.test.jsx

frontend/src/pages/StudentStatusPage.jsx

frontend/src/pages/StudentStatusPage.test.jsx

frontend/src/lib/workflow.test.js

frontend/src/lib/devPublicSheetImport.js



Backend semester importer:



backend/src/main/java/com/capvault/backend/sheets/SheetImportService.java

backend/src/main/java/com/capvault/backend/student/StudentRecord.java

backend/src/main/java/com/capvault/backend/student/StudentRecordResponse.java

backend/src/main/java/com/capvault/backend/student/StudentRecordRepository.java

backend/src/main/java/com/capvault/backend/project/ProjectMetadata.java

backend/src/main/java/com/capvault/backend/project/ProjectMetadataResponse.java

backend/src/main/java/com/capvault/backend/project/ProjectMetadataRepository.java

backend/src/main/resources/db/migration/V19\_\_semester\_tracker\_context.sql



Potential operational/current roster code:



backend/src/main/java/com/capvault/backend/student/StudentAssociationService.java

backend/src/main/java/com/capvault/backend/student/StudentRecordController.java

backend/src/main/java/com/capvault/backend/student/StudentDashboardController.java

backend/src/main/java/com/capvault/backend/monitoring/StaffMonitoringController.java

backend/src/main/java/com/capvault/backend/staff/StaffManagementService.java



Current tracker UI:

frontend/src/pages/TrackerPage.jsx

frontend/src/lib/workflow.js



Validation docs:



docs/it411\_capstone\_2\_midterm\_flow.md

docs/WildTrack\_MVP\_Validation\_Progress.md

docs/WildTrack\_MVP\_Validation\_Worksheet\_Draft.md





CURRENT ENVIRONMENT INFO



Windows / PowerShell.



Versions seen:

Java 22.0.2

Spring Boot 3.3.5

wildtrack-frontend@0.2.0

Vite 6.4.3

Vitest 3.2.7

H2 2.2.224



Flyway warning:

H2 2.2.224 is newer than tested/supported 2.2.220



Not a test blocker.



CRLF/LF warnings have appeared.

Do not mass-normalize line endings.



Frontend tests must run under the frontend project/config.



A previous wrong-context Vitest command produced false failures like:

localStorage is not defined

React is not defined

document is not defined



Ignore those.

Run from `/capvaultv2/frontend` or proper Vite config.



An old malformed PowerShell Maven comma-separated `-Dtest` invocation caused:

Missing argument in parameter list.



Use valid quoting or individual test classes.





EXACT NEXT ACTIONS



1\. In a fresh normal chat, attach/use `/capvaultv2`.



2\. First run from repo root:



git status --short

git diff --stat

git diff --check



Do not alter anything yet.



3\. Read:



frontend/src/app/StaffIdentity.jsx



frontend/src/pages/AdviserViewPage.jsx

especially lower render/status logic



frontend/src/pages/AdviserViewPage.test.jsx

especially imports/mocks/beforeEach



4\. Confirm StaffIdentity is why Adviser test remains `Loading data`.



5\. Patch AdviserViewPage.test.jsx with the minimum correct StaffIdentity mock.



6\. Run:



cd frontend

npm test -- --run src/pages/AdviserViewPage.test.jsx



Goal:

13/13 green.



If anything remains red:

inspect actual semantic failures rather than blindly rewriting expectations.



7\. Patch StudentStatusPage.test.jsx two stale assertions based on current production UX.



8\. Run:



npm test -- --run src/pages/StudentStatusPage.test.jsx -t "explains roster load failures|shows a workspace load error"



Then run full:



npm test -- --run src/pages/StudentStatusPage.test.jsx



9\. Re-run full workflow tests:



npm test -- --run src/lib/workflow.test.js



10\. Run relevant importer/UI suites, likely:



npm test -- --run src/pages/TrackerPage.test.jsx



npm test -- --run src/pages/WorkspacePage.test.jsx



Use actual filenames if slightly different.



11\. Run production frontend build.



12\. If no backend source changes were made during cleanup, at minimum rerun SheetImportControllerTest.



If backend changes are made, rerun broader known-good set:

\- SheetImportControllerTest

\- StudentAssociationServiceTest

\- StudentIdentityConflictControllerTest

\- StaffManagementServiceTest

\- FormResponseServiceTest



13\. Audit Google writeback before validation workspace.



Search:



rg -n "writeTrackerValue|tracker/writebacks|TrackerWritebackService|writeBack" frontend/src backend/src/main/java



Need determine whether:

\- submissions,

\- reviews,

\- tracker updates,

\- accept/revoke,

\- Document Check,

\- AI Review



automatically invoke Google Sheet writeback.



Validation requirement:

NONE of the test flows should automatically mutate Sir’s real Tracker.



If writeback is only explicit/manual:

document that and ensure validation users do not use it.



If any automatic writeback path exists:

disable/gate it for validation-mode use before creating workspace.



Do not invent a “writeback disabled workspace flag” unless one actually exists.



14\. Final repo checks:



git diff --check

git status --short

git diff --stat



15\. Update:



docs/WildTrack\_MVP\_Validation\_Progress.md



Include:

\- semester-aware importer behavior

\- current vs historical source rules

\- live Sheet reconciliation counts

\- no polling / no writeback

\- exact tests/build run

\- any remaining known failures

\- validation workspace readiness



16\. ONLY AFTER ALL OF THAT:

create/import the actual validation workspace.



Workspace:

IT411 2627 SEM1 — MVP Validation



Import:

1\. Team Formation

2\. Software Project Monitor

3\. Current IT411 Tracker



Verify:

303 current active students

\~63 current teams, verify exact actual value

5 current deliverables only

deadline row recognized

299 prior identity reconciliations

Team 65 new

old roster-only students inactive/not exposed

old source codes preserved

current Tracker codes operational

no Google mutations





VALIDATION WORK AFTER ENGINEERING CLEANUP



Once workspace is confirmed stable:



1\. Finalize current WildTrack problem statement.

2\. Finalize 4–5 SMART objectives.

3\. Confirm framework with adviser/Sir where possible.

4\. Build Google Form from scratch with role branching.

5\. Link Google response Sheet.

6\. Set up evidence folder.

7\. Pilot with a few users.

8\. Collect \~30+ respondents.

9\. Conduct deeper stakeholder interview with Sir Ralph on Sep 14.

10\. Produce Validation Highlights based on real findings.

11\. Use findings to create the new/refactored WildTrack SRS/SDD/SPMP.



Potential student tasks:

\- sign in with Google

\- choose/connect Student Number

\- open deliverable

\- submit valid Drive PDF

\- understand invalid/private/non-PDF errors

\- correct submission

\- find submission/status on dashboard



Potential adviser tasks:

\- locate assigned team

\- identify latest group output

\- inspect Document Check

\- inspect attempts/history

\- provide feedback

\- accept/revoke output



Potential admin tasks:

\- open validation workspace

\- inspect imported data

\- identify missing/late/problem submissions

\- run Document Check

\- optionally run AI Review

\- interpret results

\- manage acceptance/review



Do not require every participant to be directly observed unless team decides they can manage it.





DO NOT



\- Do not try Compact \& Resume again on the broken old chat.

\- Do not keep sending `continue` to that locked chat.

\- Do not claim repo commands ran when COMPACTION\_IN\_PROGRESS rejected them.

\- Do not stop after merely explaining remaining tests; user wants the cleanup actually completed.

\- Do not claim Adviser/StudentStatus tests are green until rerun.

\- Do not create the real validation workspace before cleanup and writeback audit.

\- Do not enable periodic Google Sheet polling.

\- Do not auto-reimport Sir’s live Tracker during MVP validation.

\- Do not write WildTrack test progress into Sir’s real Tracker.

\- Do not act like WildTrack is already adopted as Sir’s operational system.

\- Do not merge SRS with Refactored SRS.

\- Do not infer Refactored X is a rename of X.

\- Do not classify every unknown header as a deliverable.

\- Do not classify No. or SOFTWARE TITLE as deliverables.

\- Do not throw away old Team Formation/SPM team codes.

\- Do not use team code alone as cross-semester identity.

\- Do not leave historical Team Formation-only students active/current after Tracker import.

\- Do not overwrite historical source identity when promoting current Tracker context.

\- Do not revert the institutional-email preservation fix.

\- Do not treat the old CapVault SRS/SDD as current specifications.

\- Do not fabricate an accepted current proposal/SPMP/SRS.

\- Do not fabricate Sir Ralph feedback before Sep 14.

\- Do not claim ISO 9241-11/SUS or numeric SMART targets are approved yet.

\- Do not remove respondent identity fields against user preference.

\- Do not confuse the 15-second backend-resource refresh with Google Sheet polling.

\- Do not run Vitest under the wrong config and diagnose missing browser globals as app bugs.

\- Do not broad-reset/revert the dirty tree.

\- Do not mass-normalize CRLF/LF.

\- Do not remove `.agents/`, `.codex/`, `AGENTS.md` from `.gitignore`.

\- Do not claim 90-day auth/importer changes are live before actual commit/deployment.

