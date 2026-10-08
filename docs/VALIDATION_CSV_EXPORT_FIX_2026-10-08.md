# Validation Study CSV export repair

2026-10-08. Follow-up to PR #86, preserving its saved-identity audit fix.

An extra empty cell shifted `missingRequiredFieldKeys`, `overallStatus` and `LIMITS_PROOF_SCOPE` past their headers. The CSV also read stored identity aliases from the `storedValues` check object rather than the persisted student columns and read the original-version check object instead of its revision number.

Remove that empty cell and export `studentNumber`, `studentName`, `teamCode` and `originalRevision` from the actual record. Preserve all statuses, counts, reasons and spreadsheet-formula escaping. No score or outcome is changed by this repair.

Validation: CSV and Validation Study page suites passed all 5 tests; production build passed. The alignment regression includes mixed FAIL/UNVERIFIED records, quoted values, limits and nulls. It verifies status/reason columns remain paired and persisted identity is not replaced with roster data.

The owner-provided study file includes researcher corrections and confirmation of 13/13 passing. Preserve that provenance separately from the automated export's earlier 10-pass/1-fail/2-unverified summary; this code repair does not turn those earlier automatic results into a new run.
