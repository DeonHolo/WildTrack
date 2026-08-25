-- Durable template storage: official template bytes live in PostgreSQL instead
-- of the ephemeral local filesystem. Existing rows keep their metadata; their
-- binary payload is recovered on first read or marked explicitly unavailable.
ALTER TABLE academic_document_templates ADD COLUMN content_bytes BYTEA;
ALTER TABLE academic_document_templates ADD COLUMN bytes_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE academic_document_templates ADD COLUMN unavailable_reason VARCHAR(500);

-- storage_path becomes optional historical metadata (kept for provenance).
ALTER TABLE academic_document_templates ALTER COLUMN storage_path DROP NOT NULL;
