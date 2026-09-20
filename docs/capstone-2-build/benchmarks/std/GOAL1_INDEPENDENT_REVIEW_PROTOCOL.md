# Optional independent expected-label audit (not a Goal 1 prerequisite)

**Optional quality check.** The currently designated Goal 1 method is the project-defined, PDF-grounded reference in `GOAL1_PROJECT_REFERENCE_PROTOCOL.md`, without a mandatory independent teammate. This older checklist describes how to obtain *additional* independent assurance if desired; no reviewer identity, review timestamp or human approval has been collected or claimed.

## Source materials and scope

- Read `docs/WildTrack_Document_Validation_Test_Plan.md`, the seven-page `docs/STD TEMPLATE.pdf` and supplied STD instructions as the authority for structural expectations. The template has a sample project name and an inconsistent heading number; do not turn either into a mandatory project fact. A TOC-only occurrence is not evidence of a section in the body.
- Examine every row in `manifest.csv`, `atomic-assertions.csv` and the corresponding **actual bytes** in each fixture path. Different rows may map to the same PDF with different configured instructions, or use a separate mocked gateway condition. The document alone does not prove Google Drive permissions, source MIME type, remote metadata size, or actual provider availability. Those expectations need their own explicit test scenario and evidence.
- Each applicable atomic assertion needs a specific expected value, a source rationale, and a distinction between intended checker signals and aspects outside deterministic classification (e.g. semantic test coverage, truth of claimed execution, relevance of prose). A readable but unhelpful or fraudulent STD is still a technically readable PDF.
- The 25 families include explicit split/paired conditions for STD-15, STD-17, STD-19 and STD-25. Review every planned variant, and verify negative controls as carefully as positive controls. Check that an indicator called `template_only` is not being used as a certificate of substantive completeness.

## Reviewer procedure

1. The fixture/answer-key author provides the PDFs, applicable configured template/instructions and a copy of `manifest.csv` and `atomic-assertions.csv` with **observed classifications, old probe scores, and checker-generated findings withheld**. Previous partial development probes already exist, so this review is prospectively blind only if the reviewer does not consult them. Do not claim the original development labels were previously blind or human-verified.
2. For each assertion, inspect the source condition and determine whether the proposed expectation is correct, incorrect, or unassessable. Record disagreements with an exact source page/body excerpt or an independently verifiable technical-file property. For mock gateway cases, review the declared metadata/error setup and its correspondence to a production branch, not merely the local reference PDF.
3. Resolve disagreements **before** a new official benchmark observation. Version changed fixture bytes and expected labels rather than overwriting previously observed files or modifying an old score. Retain the draft expectation and revision rationale in the review history.
4. Only after the actual independent review is complete, enter the real reviewer's identity, real ISO-8601 review timestamp, and `VERIFIED` in the corresponding manifest (`human_label_*`) and assertion (`review_*`) fields. Do not fill these fields with ChatGPT, an invented person, an adviser who has not inspected the evidence, or a timestamp from an earlier session.
5. Freeze the final case list, variant-to-scenario mapping, PDF/template SHA-256 values, all reviewed expected labels, exact source version, scoring script, and execution protocol. Record the real freeze timestamp **before** collecting new official observations. Separate the historical provisional observations from the new planned official run.
6. Run the test-owned local/proxy benchmark once per planned condition on the frozen app revision. Keep inaccessible/error/unassessable outcomes and every scheduled assertion in the denominator. Report per-signal TP/TN/FP/FN and execution coverage alongside total assertion accuracy. A mocked Drive gateway is not a live Google permission test or a complete deployed end-to-end validation.

## Reviewer signoff to complete with real evidence

| Field | To be completed by the actual reviewer/researcher |
| --- | --- |
| Independent reviewer identity and relation to fixture author | PENDING |
| Source/template version and checksum examined | PENDING |
| Fixture/manifest/assertion versions examined | PENDING |
| Real time of review and signature/attestation | PENDING |
| Disagreements and how each was resolved | PENDING |
| New official benchmark pre-run freeze time and commit | PENDING |

**These optional fields remain PENDING.** A project-defined evaluation can proceed without them, subject to its own prospective freeze and explicit component-versus-live-provider scope. The proposed 90% target is not automatically achieved or adviser-approved by omitting a reviewer.
