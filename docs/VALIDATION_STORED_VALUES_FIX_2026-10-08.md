# Initial-record audit: persisted identity field repair

2026-10-08. Follow-up to PR #85.

The Validation Study page reported `Stored Values: FAIL` for required student number, student name and team code even though those values were saved and displayed. The save contract persists academic identity fields in dedicated `FormResponse` columns, while `valuesJson` contains ordinary form answers. The audit incorrectly looked for every required value in that JSON.

The audit now resolves `ACADEMIC_STUDENT_NUMBER`, `ACADEMIC_STUDENT_NAME` and `ACADEMIC_TEAM_CODE` from their actual persisted columns. All other required fields, including the PDF/link, still use original revision-1 JSON. It does not fill missing values from the roster, infer success from the screenshot or hardcode a score.

For edited responses, identity columns are not versioned. The audit states this limit; it cannot reconstruct historical roster changes or exact pre-save metadata. Account-binding checks are unchanged and remain visible as separate reasons.

Validation: all 15 `InitialSavedRecordAuditServiceTest` tests passed, including real academic field types with persisted identity/PDF and a blank persisted student-number failure. Diff checks passed.

After merge/deployment, reload Validation Study, select the intended workspace/form and export **initial-record CSV (Excel)**. Saved identity values should no longer be falsely listed as missing. Preserve and report any remaining FAIL/UNVERIFIED reasons; do not replace them with a forced passing score.

AI Review request/Drive failures are being handled separately so this fix can be reviewed and deployed immediately.
