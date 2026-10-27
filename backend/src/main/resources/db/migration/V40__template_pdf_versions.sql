ALTER TABLE academic_document_templates
    ADD COLUMN row_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE academic_document_template_versions (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    deliverable_key VARCHAR(180) NOT NULL,
    field_id VARCHAR(80),
    display_name VARCHAR(240) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    source_content_type VARCHAR(160) NOT NULL,
    source_sha256 VARCHAR(64) NOT NULL,
    source_bytes BYTEA,
    pdf_state VARCHAR(20) NOT NULL,
    pdf_bytes BYTEA,
    pdf_sha256 VARCHAR(64),
    pdf_pages INTEGER,
    conversion_claim UUID,
    conversion_lease_until TIMESTAMP,
    conversion_error VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prepared_at TIMESTAMP,
    CONSTRAINT uk_template_source_version UNIQUE(template_id, source_sha256),
    CONSTRAINT ck_template_pdf_state CHECK(pdf_state IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT ck_template_pdf_ready CHECK(pdf_state <> 'READY' OR
        (pdf_bytes IS NOT NULL AND pdf_sha256 IS NOT NULL AND pdf_pages > 0))
);

CREATE INDEX idx_template_pdf_pending
    ON academic_document_template_versions(pdf_state, created_at);
CREATE INDEX idx_template_version_workspace
    ON academic_document_template_versions(workspace_id, template_id);

-- The initial version uses the existing unique template id. Future versions
-- receive independent UUIDs. Do not require an extension-specific UUID function.
INSERT INTO academic_document_template_versions (
    id, template_id, workspace_id, deliverable_key, field_id, display_name,
    original_filename, source_content_type, source_sha256, source_bytes,
    pdf_state, conversion_error, created_at
)
SELECT id, id, workspace_id, deliverable_key, field_id, display_name,
       original_filename, content_type, sha256, content_bytes,
       CASE WHEN bytes_available AND content_bytes IS NOT NULL THEN 'PENDING' ELSE 'FAILED' END,
       CASE WHEN bytes_available AND content_bytes IS NOT NULL THEN NULL
            ELSE 'The original template file is unavailable. Replace the template to prepare its PDF.' END,
       created_at
FROM academic_document_templates;
