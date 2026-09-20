# Synthetic SRS benchmark inputs (no student documents)

This folder contains six **synthetic** PDF fixtures modeled only on the generic chapter/heading structure of an owner-supplied SRS template and a locally inspected populated SRS. The original two PDFs remain private, untracked/ignored in the sibling STD fixtures folder and are **never copied or loaded by this generator**. `SOURCE_PROOF.md` records source-safe page/structure anchors and per-case rationale without exposing private original content.

The file `fixtures/SRS-01_template-only.pdf` is the **sanitized mapped template authority** for all six cases. It is not a copy of the original supplied template. The submitted input for each pilot case is that case's separate sanitized PDF. Pass only `SRS_AI_INSTRUCTIONS.txt` as the synthetic SRS task instructions; no unrelated STD instructions or original student PDFs belong in this pilot.

`manifest.json` lists exactly six file names, generated-byte SHA-256, controlled fixture type, template mapping, planned observation and safe source-structure anchor. This is a **planning manifest**, not a record of real provider attempts, ground-truth human assessments, benchmark scores, or completed/student-authored SRS work. It does not assert a universal mandatory SRS section inventory. A filename such as `completed` describes the representative **synthetic control only**, not academic approval or authenticity.

Regenerate the six PDFs and manifest from repo root:

```powershell
node docs/capstone-2-build/benchmarks/srs/generate-fixtures.cjs
node --test docs/capstone-2-build/benchmarks/srs/fixture-generation.test.cjs
```

The generator uses the locally installed `frontend/node_modules/@playwright/test` Chromium. Repeated runs produce the same authored section/content conditions, but Chromium can update PDF metadata and resulting binary SHA-256. Treat each generated set's manifest hashes as its own provenance; do not silently replace frozen inputs after an official evaluation run. Tests validate structure, expected controlled mutations, PDF existence/hashes and privacy markers without invoking Gemini.

When reviewing outputs, respect `SRS_AI_INSTRUCTIONS.txt`: PDF/TOC headings are not proof of substantive section contents, a section missing in the body is different from an empty section, and an untrusted sentence **within the submitted SRS** does not confer new template authority. Scope any eventual performance report to the actual provider component/path used, its configured template/instructions, and these six artificial cases. No actual score is claimed here.
