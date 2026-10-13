-- Generation time and byte verification are different: an identical restored
-- PDF can reuse an older review after explicit download/hash verification.
ALTER TABLE ai_review_response_links ADD COLUMN source_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ai_review_field_links ADD COLUMN source_verified_at TIMESTAMP WITH TIME ZONE;
