-- Older review jobs could mark a fully filtered/empty report as COMPLETED.
-- That report is not evidence of a clean document. Make affected attempts
-- explicitly retryable without automatically making another paid request.
UPDATE ai_review_jobs
SET state = 'UNCERTAIN',
    report_json = NULL,
    completed_at = NULL,
    failure_code = 'NO_GROUNDED_FINDINGS'
WHERE state = 'COMPLETED'
  AND report_json LIKE '%The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.%';
