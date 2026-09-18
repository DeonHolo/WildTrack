# WildTrack full-page form editor specification

Status: ready-for-agent. Owner-approved direction, with reversible implementation defaults recorded below.
Deliver through Tickets 02 and 03 after Ticket 01's research deliverables are available.

## Problem Statement

The modal editor is cramped and unfamiliar to an instructor accustomed to Google Forms. It hides the relationship between suggested student information, deliverable questions and what students actually submit. Recreating forms must preserve existing responses and URLs.

## Solution

Open an editable form on its own app page. Present a centered title/description card, stacked question cards, nearby add actions and clear preview/save/publish controls, using Google Forms' familiar arrangement within WildTrack's visual system. Generate useful starting fields from existing data and let Admin customize them. Save them through the real backend and render them consistently on the student form.

## User Stories

1. As Admin, I open a new or existing form in a dedicated page that survives refresh.
2. As Admin, I return to the form list without losing a saved form.
3. As Admin, I see title, instructions, deadline and publication status together.
4. As Admin, I receive suggested identity and artifact fields from available academic data.
5. As Admin, I add an academic Section field when source data contains G7-like sections.
6. As Admin, I edit labels, descriptions, options, requiredness and ordering of configurable fields.
7. As Admin, I add short answer, paragraph, dropdown, multiple choice, checkbox and existing typed-link questions.
8. As Admin, I duplicate a question without giving two questions the same persisted identity.
9. As Admin, I remove a question from future submissions while historical answers remain accessible.
10. As Admin, I reorder fields with keyboard controls as well as any drag interaction.
11. As Admin, I preview the actual student presentation without submitting a response or spending AI tokens.
12. As Admin, I save configuration with clear saving/saved/error state.
13. As Admin, I publish/unpublish without replacing an existing public link.
14. As Admin, I keep my customizations when reopening a form or refreshing suggestions.
15. As Admin, I know when an edit conflicts with a newer saved version.
16. As a student, I see precisely the configured questions, choices and requiredness.
17. As a student, typed artifact fields reject incompatible links with actionable messages.
18. As a student, invalid choices cannot be accepted through a direct API request.
19. As a student, answering custom questions does not change my academic identity record.
20. As a reviewer, I retain access to all prior artifact answers and independent PDF reports after form edits.
21. As Admin/student, I can use the interface on desktop and mobile without clipped controls.
22. As a staff user without Admin permission, I cannot mutate a form through a route or API.

## Implementation Decisions

- Reuse existing field-definition and deliverable services and the public respondent renderer; do not create a mock frontend or second form store.
- Full-page create/edit routing under existing form management. Use persistent deliverable identity; preserve public workspace/slug URLs. Redirect or remove modal entry paths.
- Header/title card and active question-card rhythm follow the supplied reference. WildTrack typography/colors/navigation remain. Desktop add controls sit near cards; mobile controls stay reachable. No inert Google icons.
- Questions is the primary editing surface; use Settings only for actual deliverable settings. Responses links to existing scoped response/review functionality if supported; no fake response dashboard.
- Explicit Save with truthful status is the default. Do not imply Google's autosave unless reliable persistence is implemented. Warn about unsaved navigation; do not clear a failed draft.
- Publishing and saving are distinguishable; use existing lifecycle semantics, adding only the minimum draft support if needed. A preview is never a published form.
- Choice types require persistent options and array storage for multi-select, shared validation, and compatible DTO/migration behavior. Require nonempty unique option identities/labels under documented normalization.
- Suggestions are deterministic from available data and field mappings. Missing metadata does not produce fictional options. Refresh shows additions as suggestions; never silently replaces configured fields.
- Student information fields are mapped to academic attributes, separate from arbitrary question IDs. Academic Section draws choices/defaults from current source data; students cannot use form-editable labels to bypass account binding.
- Stable field IDs/keys survive edit/reorder. Duplicates get fresh IDs. Retirement preserves history. Type/option changes with existing responses must retain historical interpretation; use versioned definitions or explicit safe compatibility handling.
- Document Check/AI policies appear only on eligible PDF fields, remain independent per field, and survive unrelated edits. Non-PDF questions cannot enter PDF queues.
- Server enforces requiredness, types/options, authorization, field identity and stale edits. Existing one-link and multi-artifact forms keep working.
- Existing frontend stack/component library first. Avoid adding a full form-builder framework for these limited requirements.

## Testing Decisions

Use the highest existing observable seams: deliverable API create/update -> stored definitions -> public form -> response API -> staff review. Test label/reorder retention and retired history, not component internals.

Required cases: legacy form; five-artifact MVP form with Google Form URL first; two PDFs with independent policies; typed choice/text submission and invalid direct API; Section suggestion present/absent; duplicate/reorder/retire with historical answers; same URL after edit; unsaved/error/reload; non-Admin mutation denied; preview no response/provider call.

Browser evidence: desktop 1280x800 and mobile 390x844, full-page route and reload, add/edit/reorder/save/preview/publish, public form round trip, keyboard actions, no horizontal overflow. Use seeded/local fixtures, no real students.

## Out of Scope

Google-hosted form creation/API integration; AI form generation; mandatory file picker; arbitrary uploads; quizzes/grading; image/video/theme builders; realtime collaboration; conditional branches/page breaks; Google Sheets writeback; academic spreadsheet editor (separate tickets); forced OTP; production publishing.

## Further Notes

The screenshot includes controls outside scope. Match its interaction hierarchy, not every icon or Google's branding. Durable image and feature references are in REFERENCES.md. Code pointers belong in CODE_MAP.md, not this spec. Current branch behavior must be inspected before choosing migration numbers.

