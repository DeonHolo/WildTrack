# Document Check Submission Substance Specification

## Problem Statement

Document Check currently gives template-heading detection enough weight to make a readable, substantial submission require attention when headings are renamed or customized. The research follow-up showed that this structural task performs poorly on realistic SRS module and transaction headings, while the stakeholder need is narrower: identify submissions that are effectively empty, very sparse, or still substantially unfilled from the official template.

The product also exposes a large amount of structural detail by default, which makes the Document Check dialog harder to scan than the screening decision requires.

## Solution

Document Check becomes a deterministic submission-substance screen after file access and PDF readability have succeeded. It reports one of three states: Looks substantially filled, Needs attention, or Could not determine. The conclusion is accompanied by one short reason. Detailed file, template, and heading evidence remains available behind a collapsed details disclosure.

Template structure remains informational. Missing or renamed headings no longer change the substance verdict. AI Review remains responsible for substantive template compliance and requirement-level findings.

## User Stories

1. As an adviser, I want to see whether a submitted PDF appears substantially filled so that I can quickly find submissions that may be empty or largely unmodified templates.
2. As an adviser, I want a short reason for a Needs attention result so that I know whether the concern is sparse content or a template-like submission.
3. As an adviser, I want a completed document with customized module or transaction headings to remain eligible for Looks substantially filled so that naming differences do not create false alarms.
4. As an adviser, I want a completed document that retains official template wording to pass when strong added-content evidence exists so that boilerplate retention alone does not invalidate substantial work.
5. As an adviser, I want a no-template submission to remain assessable using document-only evidence so that an absent official template does not automatically block Document Check.
6. As an adviser, I want extraction-inconclusive PDFs labeled Could not determine so that technical uncertainty is not misrepresented as an empty submission.
7. As a student, I want Document Check wording to make clear that the result does not grade or accept my work.
8. As a staff reviewer, I want file-access failures kept separate from submission substance so that Drive/provider problems are not confused with document quality.
9. As a staff reviewer, I want structural-heading information available on demand so that it can still support manual review without dominating the result.
10. As a researcher, I want frozen thresholds and a held-out benchmark so that the Goal 1 result cannot be improved retroactively by tuning against the final cases.

## Implementation Decisions

- Submission substance is a distinct deterministic concept from file accessibility, template structure, and AI Review compliance.
- Access, MIME type, downloadability, PDF integrity, encryption, and provider failures keep their existing technical outcomes.
- Substance classification runs only after a PDF is successfully opened.
- The three public states are Looks substantially filled, Needs attention, and Could not determine.
- Could not determine is reserved for technical uncertainty in substance assessment, especially unusable text extraction.
- Needs attention is a screening signal, not proof that a submission is academically inadequate.
- When no template exists, document-only signals can still produce Looks substantially filled or Needs attention, with explicit disclosure that no official template was compared.
- When a template exists, substantial added content can outweigh retained template boilerplate.
- Missing template headings, customized headings, and structural-heading counts never alter the substance state.
- Template-heading evidence remains available as secondary information.
- The main dialog shows one conclusion, one short reason, and a collapsed details disclosure to avoid increasing UI density.
- The classifier exposes concrete evidence instead of a probability or percentage-likelihood meter.
- Frozen thresholds are defined in the Goal 1 follow-up benchmark protocol and must not be retuned from held-out outcomes.

## Testing Decisions

- The highest behavior seam is the saved Document Check report produced after a readable PDF has been inspected. Tests should assert the public classification and evidence rather than private scoring helpers.
- PDF extraction tests verify text-bearing-page observations using real generated PDFs.
- Service tests verify that template-heading misses no longer create the substance verdict or attention state.
- Frontend tests verify the three states, compact reason text, collapsed evidence, no-template disclosure, and backward compatibility for older saved reports.
- The 30-case frozen held-out benchmark is scored only after implementation. Overall accuracy must be reported with per-class recall and a confusion matrix.
- Historical heading-detection and AI Review benchmark results remain separate and retain their original denominators.

## Out of Scope

- Determining whether student-authored text is sensible, correct, original, or academically sufficient.
- AI-based semantic assessment inside Document Check.
- Revision-substance or change-magnitude scoring between two submissions.
- Treating page count alone as proof of substance.
- Changing Google Drive access semantics or file-monitor scheduling.
- Reinterpreting the historical 52/52 STD result or the 26.56% SRS heading-detection result.

## Further Notes

The calibration cohort intentionally includes a borderline partially filled document. Borderline calibration documents are not included in the scored hold-out set. The final held-out labels were frozen before production implementation and must remain unchanged even if the first result fails the 90% target.
