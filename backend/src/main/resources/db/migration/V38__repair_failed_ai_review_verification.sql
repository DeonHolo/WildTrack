-- Older code advanced these receipts when an attempt started. For unfinished
-- attempts their provenance is ambiguous; fall back to the saved report date.
-- New code advances them only on saved completion or verified completed reuse.
UPDATE ai_review_response_links SET source_verified_at = NULL
WHERE cache_key IN (SELECT cache_key FROM ai_review_jobs WHERE state <> 'COMPLETED');
UPDATE ai_review_field_links SET source_verified_at = NULL
WHERE cache_key IN (SELECT cache_key FROM ai_review_jobs WHERE state <> 'COMPLETED');
