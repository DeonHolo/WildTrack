ALTER TABLE ai_review_field_links ADD COLUMN IF NOT EXISTS source_revision BIGINT NOT NULL DEFAULT 0;
CREATE SEQUENCE ai_review_capture_sequence START WITH 1;
ALTER TABLE ai_review_field_links ADD COLUMN capture_generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ai_review_response_links ADD COLUMN capture_generation BIGINT NOT NULL DEFAULT 0;
