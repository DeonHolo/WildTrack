# Academic document update register

**Status:** preparation only. This register identifies what the team must reconcile in current academic documents; it does not rewrite unsupported historical content.

## SRS

Update/current-state items to verify against the authoritative SRS template and deployed build:

- WildTrack naming/rebrand and current role terminology.
- Full-page configurable form editor and supported typed fields.
- Student Number as authoritative academic identity anchor; Team Code/Section behavior.
- No student file upload; Drive/PDF inputs are links.
- Student-visible Document Check details and advisory nature.
- AI Review grounding/no-template limitations and Admin/staff exposure only where actually present.
- Account-binding behavior after Ticket 06 is finalized.
- Academic grid/import reconciliation after Tickets 04/05 are finalized.
- Meaningful-change lateness/history semantics after Tickets 07/08 are finalized.
- Optional Drive revision-history integration must remain labeled optional/pending until Ticket 09 is explicitly authorized and implemented.

## SDD

Update/current-state architecture items after corresponding tickets stabilize:

- V21 configurable submission questions already exist.
- Ticket 04 academic editing API/data model and any new migration.
- Ticket 05 import preview/reconciliation transaction/version model.
- Ticket 06 canonical person/account association and disconnect audit model.
- Ticket 07 effective timestamp/material-change model.
- Ticket 08 observed history storage/source labeling.
- Ticket 09 delegated OAuth design only if owner-authorized implementation occurs.
- Preserve distinction between API-key current-file Document Check and any future delegated history gateway.

## SPMP

Update management/testing sections with:

- frozen MVP validation objectives and evidence channels;
- Objective 3 Refactored SRS T1/T2 protocol;
- response/evidence folder ownership and restricted-data handling;
- Ticket 10 benchmark execution plan/results when real runs exist;
- explicit external prerequisites: adviser/framework endorsement, real participant collection, optional Drive consent;
- release/deployment state actually used for validation.

## STD / testing documents

- Keep the supplied STD template/instructions as benchmark authority where applicable.
- Do not ask students to grade or author STD benchmark fixtures for this validation.
- Record deterministic Document Check and AI Review benchmark cases separately from participant questionnaire/task data.

## Historical/current distinction

When updating SRS/SDD/SPMP, preserve a short change note for capabilities that differ from older CapVault/WildTrack documents. Do not silently rewrite historical claims as though they had always described the current build.

Full rewrites remain pending the team's authoritative current academic templates/content and completion of the tickets that materially change those sections.
