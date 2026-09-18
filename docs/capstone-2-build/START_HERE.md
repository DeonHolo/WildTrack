# Capstone 2 build workflow

Prepared 2026-09-19. This package is the planning deliverable; implementation has not started.

## Use

- **Editor run:** copy the editor prompt in PROMPTS.md. It completes Ticket 01 first, then 02 and 03. The outcome is the questionnaire package plus the working full-page WildTrack editor.
- **Full-session run:** copy the full-session prompt. Complete 01 first, then work the ready tickets in dependency order. External prerequisites remain explicitly blocked; continue unrelated tickets.
- **Resume:** copy the resume prompt with the existing mode. A lower-cost model reads PROGRESS.md, the active ticket and the relevant spec only. It need not reconstruct this conversation.

"One-shot" means one initiating prompt with autonomous implementation and verification. It does not guarantee one model turn, one uninterrupted credit window, or permission to publish/deploy.

## Read order

1. PROGRESS.md: current mode, active ticket, last completed slice, next command.
2. DECISIONS.md: authoritative settled scope and explicit limitations.
3. Relevant spec: EDITOR_SPEC.md for 02/03; SESSION_SPEC.md for the overall work.
4. Active ticket under `.scratch/capstone-2-session/issues/`.
5. CODE_MAP.md for current implementation entry points; refresh these before editing.
6. REFERENCES.md only for the feature being implemented.
7. EVIDENCE.md for already completed checks. Read source transcripts/progress documents only if a specific fact needs clarification.

Earlier session notes contain superseded alternatives. DECISIONS.md condenses the latest owner instructions. New direct user instructions override it; update the decision and progress files when that happens.

## Skill route

Already applied: ask-matt -> to-spec -> to-tickets, with writing-for-agents for this package. No further grilling is needed. The owner explicitly asked for the workflow without more clarification rounds, so ordinary design/test-seam choices are recorded here instead of asking for another interview or ticket-approval ceremony.

Execution: implement -> targeted TDD for behavioral changes -> code-review.
- astra-orchestrator: root integrates; Luna/explorer maps bounded code, Luna/worker implements isolated ownership, Luna/tester checks behavior, reviewer reviews material changes. Follow repository instructions. Do not use multiple writers on the same file.
- frontend-design: implement the familiar editor composition inside WildTrack's existing visual system. Use the supplied screenshot as reference.
- browser:control-in-app-browser: inspect desktop/mobile interaction and screenshots using its current installed SKILL.md. Playwright is the automated regression seam.
- research: use primary sources when Ticket 01 selects the evaluation framework or when external Google behavior matters.
- pdf:pdf: read the STD template and later create/inspect requested PDF artifacts. Documents skill only for requested DOCX outputs.
- to-questionnaire is a discovery-interview skill, not a validated measurement instrument. Borrow plain question wording when useful; it does not replace Ticket 01's metric/scoring work.
- handoff principles guide the compact resume record. Keep the durable state in this repository because the user specifically requested progress-file continuity, rather than relying on an OS-temp handoff.
- credentials/OAuth: prepare concrete setup instructions when needed; actual permission grants use the user's official Google screens. Never ask for secrets in chat.

Installed skill roots at preparation: `C:/Users/Deon Holo/.agents/skills`; repository orchestration at `.agents/skills/astra-orchestrator/SKILL.md`. Skills missing from a future catalog may still exist there: check the path before claiming absence. Read only skills relevant to the active ticket.

## Local tracker

For this workstream only, tracker = `.scratch/capstone-2-session/issues/`.
Labels: ready-for-agent, in-progress, verified-local, ready-for-human, blocked-external.
For Tickets 09/11, track a separate `prepared-local` milestone: preparation is agent work, while consent/live history and actual data analysis may remain pending. Full-mode closeout requires their preparation milestones, not invented external completion.
Spec reference = this directory. No remote issues or global AGENTS configuration are needed. Local tickets are reviewable artifacts, not external publication.
01 is the delivery priority. Its output must be shown before spending the rest of the run on application changes. Graph dependencies govern technical blockers; this priority governs scheduling.

## Verification and checkpoints

Use RTK-prefixed shell commands. Preserve the initial dirty worktree. No blanket staging/reset/cleanup.
Before each slice: record active ticket, intended files and next test in PROGRESS.md.
After each meaningful edit/test: record exact files changed, command and result (or NOT RUN), remaining defects, next step. Write state before launching a long test or tool call.
At ticket completion: verify each acceptance criterion, append evidence, update ticket status and progress, then move on.
If interrupted abruptly, the next model checks git diff, processes and test logs before rerunning anything. The last checkpoint is a hint, not proof that an operation finished.
Low credits: stop spawning redundant agents; finish the smallest safe slice and write the checkpoint. Switching models is done by the user/app; neither credits nor auto-continuation are guaranteed.
Lower-cost continuation: one vertical slice at a time, existing conventions first, no redesign or scope expansion. Use an independent review for identity/migration/auth changes when available; otherwise record the missing review and avoid claiming release readiness.
Resume in the same checkout. These planning files and local tickets are not committed; a new worktree/host may not contain them. If moving, explicitly transfer this package, `.scratch/capstone-2-session`, referenced source documents and the unfinished code diff, then verify them before continuing. Do not assume a Git checkout includes ignored local tickets.

## Completion boundaries

Planning files existing does not mean Ticket 01's instrument or any app feature is done.
Local build/tests do not prove OAuth consent, hosted access or actual study results.
No commits, pushes, production deployment, Google Form publication, recruitment messages, paid AI usage or live Sheet writes are included in these prompts.
Show existing results without fabricating responses, framework approval, revisions, editor identities or benchmark pass rates.

Package structure check: `rtk proxy powershell -NoProfile -File docs/capstone-2-build/validate-package.ps1`. This validates planning files/ticket structure, not application functionality.
