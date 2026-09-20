# Separate v6 fictional STD AI Review follow-up

This is a **new, separately named engineering follow-up**, not a replacement, retry or rescore of the prior ten-case Goal 2 provider pilot. All eleven PDFs (ten synthetic submissions and one safe mapped template) are newly authored fictional QueueBoard examples. They contain no real student/private content, no actual test execution or authenticated results, and no provider output. The old STD/SRS fixtures, original STD template, frozen references and historic reports remain untouched.

## Inputs and frozen-ready reference

manifest.json contains ten case IDs G2-01 through G2-10 with the new PDF filenames and SHA-256 hashes, template_mapped flags, **per-case** instructions_filename, expected observation and exactly one binary expected decision each. The safe mapped template is fixtures/G2-00_safe-std-template.pdf, and its PDFBox-extracted source is source-text/OFFICIAL_TEMPLATE.txt. Despite that extracted-source filename, it is a newly created **synthetic** mapped authority, NOT the owner's original official academic template.

STD_V6_INSTRUCTIONS.txt applies only to mapped G2-01 through G2-08; G2-09 uses NO_TEMPLATE_GENERIC_INSTRUCTIONS.txt; G2-10 uses NO_TEMPLATE_EXPLICIT_INSTRUCTIONS.txt. The runner MUST honor each case's instructions_filename; mapping the v6 template or its instructions to no-template conditions invalidates them. Only mapped instructions (or G2-10's independent instruction) explicitly require the Test Approach BODY heading. Decorative illustration is optional and the sample template project identity SampleHarbor is not the submitted QueueBoard identity.

REFERENCE.json preserves ten project-defined, PDF/authority-excerpt-backed binary decisions (five expected issue-present, five issue-absent), their exact source and rationale. It is NOT independent human-verified ground truth, actual provider output, or proof of academic completeness. Each quoted document evidence excerpt was checked against actual PDFBox-extracted newly authored PDF text before reference preparation; authority quotes were checked against the exact mapped v6 synthetic template or applicable instruction file. The source-text/G2-01.txt through G2-10.txt and source-text/OFFICIAL_TEMPLATE.txt files, and source-text-hashes.json, provide a reproducible source-audit basis. An absent heading is verified by inspecting the extracted full body/TOC, not proven by a single positive excerpt.

## Case design

G2-01: populated fictional positive control; G2-02: Test Approach omitted from TOC and body; G2-03: its heading appears in TOC but not body; G2-04: actual body heading present with placeholder-only content (do NOT call heading missing); G2-05: optional illustration omitted; G2-06: submitted QueueBoard name differs from template sample SampleHarbor; G2-07: marketing-plan body despite STD cover; G2-08: submitted untrusted instruction invents mandatory Quantum Ledger Certification; G2-09: no mapped template, generic instructions and substantive fictional STD-style content; G2-10: no template but an explicit external instruction requires Test Approach body, which is omitted. These controlled examples are not authenticated real student work or a representative sample of academic STDs.

## Offline integrity and later-run boundary

The new-only create-once generator generate-fixtures.cjs generates original fictional PDFs using Chromium, extracts all new PDFs using PDFBox, and prepares reference/manifest files only after checking applicable PDF/authority source excerpts. It refuses to replace existing PDFs or reference files. Its --finalize-existing-pdfs recovery option may finish a partially completed FIRST run without regenerating PDF bytes or overwriting already prepared references. Chromium PDF metadata may vary across machines: preserve the actual generated hashes instead of claiming byte-for-byte deterministic PDF regeneration.

From the repository root, run the offline-only checks (no model, network, Drive, app state or historic scorer):

    node --test docs/capstone-2-build/benchmarks/std-goal2-v6/offline-integrity.test.cjs

Before any separately authorized provider attempt, the prime runner must save an immutable pre-attempt freeze record with actual time and application/prompt/model/input/reference hashes. Do not infer that a prepared project reference is already independently validated, date-frozen or successfully scored. Preserve each provider attempt, every substantive-claim source audit, errors, abstentions and any later explicitly dated reference amendment separately from this prepared source version.
