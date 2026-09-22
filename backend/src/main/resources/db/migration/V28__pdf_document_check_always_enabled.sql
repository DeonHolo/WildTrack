-- PDF Document Check is mandatory for every field, including inactive fields
-- that may later be reactivated. Do not alter submissions, reports, review
-- decisions, PDF requiredness, AI settings, or historical timestamps.
UPDATE academic_deliverable_fields
SET document_check_policy = 'AUTO'
WHERE field_type = 'DRIVE_PDF' AND document_check_policy <> 'AUTO';

-- Repair historical non-PDF policies without enabling checks on other inputs.
UPDATE academic_deliverable_fields
SET document_check_policy = 'OFF'
WHERE field_type <> 'DRIVE_PDF' AND document_check_policy <> 'OFF';
