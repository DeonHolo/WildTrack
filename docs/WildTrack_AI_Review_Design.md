# WildTrack AI Review Design

**Status:** Approved design decision  
**Date:** August 23, 2026  
**Scope:** Economical staff-facing AI review of submitted capstone PDFs

This document is authoritative for AI Review behavior. Where earlier notes or roadmaps describe AI Review as unresolved, student-visible, adviser-triggered, automatic, or capable of making academic decisions, this approved design supersedes them.

## 1. Purpose

WildTrack separates deterministic file screening from semantic document review.

**Document Check** is regular backend logic. It determines whether a submitted Google Drive link is accessible, downloadable, and an actual readable PDF. It also records objective properties such as MIME type, size, modification time, page count, readable-text length, SHA-256, and deterministic similarity to the official template.

**AI Review** helps Sir Ralph understand a submission without reading the whole PDF first. It summarizes the submitted work, compares it with an approved deliverable checklist, identifies major omissions or weak sections, and recommends where staff should look first. It does not grade, accept, reject, archive, or update the tracker.

The intended result is a concise triage report that reduces the time Sir spends opening routine or obviously incomplete submissions. It is not an automated academic evaluator.

## 2. Approved Model Strategy

The first pilot uses one model only:

- Model: `gemini-2.5-flash-lite`
- Provider: Gemini Developer API
- Selection reason: stable native PDF support, structured outputs, high-volume capacity, and the lowest current paid multimodal pricing suitable for this workflow
- Stronger-model fallback: not included in the first pilot

WildTrack must record the exact model identifier with every report. A stronger model may be considered only after the pilot shows that Flash-Lite cannot reliably produce the approved report.

Google's official references:

- [Gemini 2.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

The current capstone implementation and testing phase uses the Gemini API free tier. Enabling paid billing is deferred and must not block AI Review development or testing. The API key must still remain backend-protected and must never be exposed through Vite, browser code, a repository file, or a public form response.

## 3. Evaluation Basis

Each deliverable has one active official template and one reusable evaluation checklist.

1. Sir uploads or replaces an official template.
2. WildTrack extracts its readable content.
3. Flash-Lite generates a proposed checklist from the template instructions.
4. Sir may review and edit the checklist when needed.
5. The approved checklist is versioned and reused for later AI Reviews.

Checklist generation is not repeated for every student submission. Reusing the checklist reduces input size, cost, and inconsistent interpretation of the same template.

The checklist must describe observable requirements rather than assign points or grades. Examples include required sections, expected diagrams, required tables, traceability expectations, and deliverable-specific instructions.

## 4. Individual Review Flow

1. Document Check completes for the current canonical PDF.
2. AI Review remains unavailable when the current file is inaccessible, non-downloadable, corrupt, or not a PDF.
3. Sir opens a response and selects **AI Review**.
4. WildTrack checks for a current cached report.
5. If no current report exists, the backend sends the submitted PDF and active checklist to Flash-Lite.
6. The backend validates the structured response and stores the report in PostgreSQL.
7. The existing response-detail interface displays the result.

Only Sir/Admin can initiate or rerun AI Review. Assigned advisers may view an existing current or historical report for their authorized teams, but cannot run or rerun it. Students never see AI Review output. Students continue to see permitted Document Check results and manually authored adviser feedback.

## 5. Batch Review Flow

Batch review is scoped to one deliverable at a time.

1. Sir selects **Review all** for a deliverable.
2. WildTrack selects only the latest canonical PDF for each student response.
3. Current cached reports are skipped.
4. Missing, inaccessible, invalid, or unreadable PDFs are skipped with a reason because Document Check already handles those conditions.
5. Remaining submissions are submitted through Gemini Batch API.
6. Batch progress and per-item outcomes are stored in PostgreSQL.
7. A failed item does not stop successful items.
8. Completed reports appear incrementally as results become available.

The UI must not promise immediate completion. It should distinguish queued, running, completed, partially completed, failed, and cancelled work.

## 6. Report Contract

AI Review returns validated structured data containing:

### Summary

Three to five sentences explaining what the document contains and what the project or submission is attempting to accomplish.

### Instruction Checklist

Each requirement uses one status:

- `MET`
- `PARTIAL`
- `MISSING`
- `UNCLEAR`

Each item includes a concise explanation and page evidence when evidence is available. The model must use `UNCLEAR` rather than invent evidence.

### Main Concerns

Up to five important weaknesses, omissions, contradictions, or areas requiring staff attention.

### Review Priority

One of:

- `ROUTINE`
- `NEEDS_ATTENTION`
- `OPEN_FIRST`

Review priority controls sorting and triage only. It is not a grade or final decision.

### Suggested Next Action

A concise recommendation describing what Sir or the assigned adviser should inspect, verify, or ask the student to revise.

### Confidence and Limitations

The report records confidence and any limitations caused by unreadable pages, missing visual evidence, unclear instructions, or uncertain interpretation.

## 7. Freshness and Caching

Every report is bound to:

- Workspace and deliverable
- Response and canonical file version
- PDF SHA-256
- Drive file ID and modification time
- Checklist version
- Prompt version
- Model identifier
- Generated timestamp and initiating staff identity

A report is current only when all relevant versions still match.

If the PDF, checklist, prompt, or selected model changes, WildTrack preserves the old report but marks it **Outdated**. It does not rerun AI automatically. Sir decides whether a new paid review is useful.

Opening a report, refreshing a page, importing a Sheet, or rerunning deterministic Document Check must not create another Gemini request when the AI Review cache remains current.

## 8. Free-Tier and Cost Controls

- AI Review never runs automatically after submission.
- Draft autosave never calls Gemini.
- Document Check remains the automatic first layer.
- The current capstone phase uses free-tier Gemini API quota.
- Current reports are reused.
- One canonical PDF is reviewed per active response.
- Deliverable-wide work uses Batch API.
- Template instructions are converted into a reusable checklist once per template version.
- Input and output token usage is stored for cost reporting.
- Sir/Admin can see estimated and actual batch usage.
- No automatic stronger-model escalation exists in the pilot.


- Paid billing is a later deployment decision, not a requirement for the capstone implementation.
## 9. Error Handling

- Invalid files are rejected from AI Review before an API request is created.
- Gemini timeouts, quota failures, schema failures, and safety blocks use distinct internal failure codes.
- A failed individual review may be retried manually.
- A failed batch item does not fail the entire batch.
- Invalid model output is never displayed as a valid report.
- Existing valid historical reports are not deleted by a failed rerun.
- Staff sees plain operational wording and a retry action where retrying is useful.

## 10. Prompt Boundary

The prompt instructs Gemini to:

- Evaluate only against the supplied PDF and approved checklist.
- Distinguish missing evidence from weak evidence.
- Cite pages when possible.
- State uncertainty rather than infer unsupported facts.
- Avoid assigning grades or making acceptance decisions.
- Avoid treating deterministic file properties as academic conclusions.
- Return only the approved structured report schema.

The prompt and schema are versioned application assets. Prompt changes invalidate the current cache but do not delete previous reports.

## 11. Pilot Validation

Before AI Review is trusted in a student pilot, the team will evaluate Flash-Lite against approximately 20 to 30 representative submissions that Sir already understands.

The evaluation records:

- Checklist status agreement with Sir
- Missed required sections
- Unsupported claims
- Page-evidence accuracy
- Summary usefulness
- Review-priority usefulness
- Latency
- Input and output token usage
- Approximate cost per document and per deliverable batch

The pilot succeeds when reports reliably help Sir decide what to open and inspect. The model does not need to replace Sir's academic judgment. If Flash-Lite is inadequate, the team will document the failure cases before considering a stronger model or a narrower report contract.

## 12. Explicitly Excluded

- Student-visible AI Review reports
- Adviser-triggered AI Review
- Automatic AI review on submission
- Automatic grading
- Automatic acceptance, rejection, feedback, tracker changes, or archive actions
- Automatic escalation to a more expensive model
- Re-evaluating unchanged PDFs
- Using Google Docs as the primary AI report store

PostgreSQL is authoritative for AI reports, jobs, versions, usage, and audit history. Google Sheets may receive a short operational status later, but it is not the source of truth for AI Review.

