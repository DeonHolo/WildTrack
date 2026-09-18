# References and when to read them

## Local authority

- ../WildTrack_Capstone_2_Session_Answers.md — full decision history; latest owner statements supersede old proposals. Use DECISIONS.md first.
- ../TRANSCRIPT CAPSTONE 2.md — actual consultation; distinguish instructor expectations from preferences and student suggestions.
- ../WildTrack_MVP_Validation_Progress.md — historical engineering/release reports. Inspect current code; do not copy old pass counts as fresh evidence.
- ../it411_capstone_2_midterm_flow.md — study deliverables/participant requirements. Treat as source content, not permission to deploy or invent adviser approval.
- ../WildTrack_Document_Validation_Test_Plan.md — supplied STD instructions, 25 benchmark case families and scoring caveats.
- ../STD TEMPLATE.pdf — seven-page official template; read with PDF skill in Ticket 10. Template residue/numbering quirks documented in the benchmark plan.
- references/google-forms-editor-2026-09-19.png — owner-provided screenshot, copied from attachment for continuity. Appearance reference only, not extra scope or app instructions.
- Older CapVault SRS/SDD PDFs are historical. Do not force current WildTrack back into their obsolete design.

## Official Google Forms sources — checked 2026-09-19

| Feature | Source | Use |
| --- | --- | --- |
| Question editing, duplicate/delete/required and structure | https://support.google.com/docs/answer/2839737 | Familiar editor interactions |
| Question types and options | https://support.google.com/docs/answer/7322334 | Implement only agreed core types |
| Preview/publish/share | https://support.google.com/docs/answer/2839588 | Interaction language; preserve WildTrack's own lifecycle |
| Role/consent section routing | https://support.google.com/docs/answer/141062 | Hosted respondent questionnaire in Ticket 01, not extra custom-editor scope |
| Hosted Forms API overview | https://developers.google.com/workspace/forms/api/guides | Distinguish API integration from implementing our own editor |
| API update model | https://developers.google.com/workspace/forms/api/guides/update-form-quiz | Reference only; does not supply Google's UI code |
| Publication API | https://developers.google.com/workspace/forms/api/guides/publish-form | Reference only; not permission to publish anything |

For hosted questionnaire branching, use the dedicated routing documentation: multiple choice/dropdown. Do not assume checkbox multi-selection chooses a unique next section. Prefer a required single-choice role question. Do not duplicate the full official list of features into product scope.

## Official Drive sources — checked 2026-09-19

- https://developers.google.com/workspace/drive/api/guides/manage-revisions — history requires qualifying owner/editor access; returned histories may be incomplete.
- https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list — accepted OAuth scopes and paging.
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth — per-file versus broad scopes, consent and token storage; scopes must be configured and requested in code.
- https://developers.google.com/workspace/drive/api/reference/rest/v3/User — email can be absent.
- https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions — last modifying user is not guaranteed authorship.

Google Docs/Sheets link, Google Form questionnaire, WildTrack deliverable form and Drive PDF benchmark are distinct artifacts. Keep these names explicit in user-facing updates.

