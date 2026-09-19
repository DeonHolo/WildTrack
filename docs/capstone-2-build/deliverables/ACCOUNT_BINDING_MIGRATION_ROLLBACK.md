# Ticket 06 account-binding migration and rollback plan

Scope: Flyway migration `V23__canonical_student_account_bindings.sql` and the first-successful-submission canonical account-binding behavior.

## What V23 changes

- Creates `canonical_student_account_bindings`, keyed by normalized Student Number.
- Adds a unique index on the active `google_subject` column so one Google subject cannot own two canonical Student Numbers.
- Seeds one `UNBOUND` row for every distinct nonblank Student Number already present in `academic_student_records`.
- Does not rewrite or delete existing academic records, workspace associations, form responses, response versions, drafts, conflicts, or audit events.
- Does not choose a winner from historical duplicate account claims. Runtime reconciliation keeps ambiguous legacy claims explicit for Admin review.

## Forward rollout

1. Take the normal database backup/snapshot before applying the release.
2. Apply Flyway migrations and deploy the Ticket 06 application code in the same controlled release.
3. Verify Flyway records V23 as successful.
4. Verify the canonical table contains at least the distinct normalized nonblank Student Numbers represented in `academic_student_records`.
5. Verify seeded rows are `UNBOUND`; ownership is created only by a successful response save or explicit Admin recovery.
6. Run the Ticket 06 focused transaction/concurrency/authorization suite before release acceptance.
7. Inspect Admin account management for any legacy conflict rows. Do not resolve ambiguous historical claims automatically.

Useful read-only checks:

```sql
SELECT status, COUNT(*)
FROM canonical_student_account_bindings
GROUP BY status;

SELECT LOWER(TRIM(student_number)) AS student_number_key, COUNT(*)
FROM academic_student_records
WHERE student_number IS NOT NULL AND TRIM(student_number) <> ''
GROUP BY LOWER(TRIM(student_number));
```

## Normal rollback

The safest rollback is an **application rollback only**:

1. Stop writes for the release rollback window.
2. Roll the application back to the last known-good pre-Ticket-06 build.
3. Leave `canonical_student_account_bindings` and the successful V23 Flyway history entry in place.
4. Verify the previous application starts and its existing response/workspace-association paths still operate.

The pre-Ticket-06 application does not depend on the V23 table, so leaving the table in place avoids destroying account-recovery evidence and avoids creating a mismatch with Flyway history. Existing responses and legacy workspace associations remain the authoritative pre-Ticket-06 data for that older application.

## If a database rollback is required

Do not routinely run an inverse SQL migration or manually drop the V23 table while leaving Flyway history unchanged. That would make a later forward deployment unsafe because Flyway would consider V23 already applied even though its schema object is missing.

If schema rollback is genuinely required because of a database-level incident:

1. Stop application writes.
2. Export/snapshot `canonical_student_account_bindings` for recovery/audit.
3. Restore the **entire database** from the pre-V23 backup, including the matching Flyway schema-history state.
4. Deploy the matching pre-Ticket-06 application build.
5. Verify responses, response versions, workspace associations, identity conflicts and academic records against the restored snapshot before reopening writes.

Any manual alternative that edits both the V23 objects and Flyway history is a DBA recovery procedure, not an application rollback, and must be reviewed separately before execution.

## Re-forward after an application-only rollback

When the V23 table was intentionally left in place, redeploy the corrected Ticket 06 application without re-running or deleting V23. Flyway should see V23 as already successful, and the application can resume using the preserved canonical rows. Re-run the focused Ticket 06 acceptance tests and inspect unresolved Admin conflicts before considering the feature restored.

## Known ownership limitation

The binding is a first-successful-submission association, not independent proof of student identity. A person who can authenticate with Google and correctly select an as-yet-unclaimed Student Number can still be the first claimant. The UI and Admin recovery flow must keep this limitation explicit and must not describe the binding as verified student ownership.
