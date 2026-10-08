ALTER TABLE ai_review_jobs ADD COLUMN latest_attempt_report_json TEXT;
ALTER TABLE ai_review_jobs ADD COLUMN latest_attempt_completed_at TIMESTAMP WITH TIME ZONE;

UPDATE ai_review_jobs
SET latest_attempt_report_json = report_json,
    latest_attempt_completed_at = completed_at
WHERE report_json IS NOT NULL
  AND latest_attempt_report_json IS NULL;

UPDATE ai_review_jobs
SET latest_attempt_report_json = NULL,
    latest_attempt_completed_at = NULL
WHERE state = 'UNCERTAIN'
  AND report_json IS NULL
  AND failure_code = 'NO_GROUNDED_FINDINGS';
