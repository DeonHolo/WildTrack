CREATE TABLE academic_deliverable_fields (
    id                     VARCHAR(80)  PRIMARY KEY,
    deliverable_id         UUID         NOT NULL REFERENCES academic_deliverables(id) ON DELETE CASCADE,
    field_key              VARCHAR(160) NOT NULL,
    label                  VARCHAR(240) NOT NULL,
    field_type             VARCHAR(40)  NOT NULL,
    required               BOOLEAN      NOT NULL DEFAULT TRUE,
    display_order          INTEGER      NOT NULL DEFAULT 0,
    document_check_policy  VARCHAR(20)  NOT NULL DEFAULT 'OFF',
    ai_review_enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    active                 BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_deliverable_field_key UNIQUE (deliverable_id, field_key)
);

CREATE INDEX idx_deliverable_fields_deliverable
    ON academic_deliverable_fields(deliverable_id, active, display_order);

INSERT INTO academic_deliverable_fields (
    id, deliverable_id, field_key, label, field_type, required, display_order,
    document_check_policy, ai_review_enabled, active
)
SELECT
    CAST(id AS VARCHAR(36)) || ':legacy',
    id,
    CASE WHEN pdf_required THEN 'documentPdf' ELSE 'primaryLink' END,
    CASE WHEN pdf_required THEN 'PDF Drive Link' ELSE 'Submission Link' END,
    CASE WHEN pdf_required THEN 'DRIVE_PDF' ELSE 'GENERAL_URL' END,
    TRUE,
    0,
    CASE WHEN pdf_required THEN 'AUTO' ELSE 'OFF' END,
    CASE WHEN pdf_required THEN TRUE ELSE FALSE END,
    TRUE
FROM academic_deliverables;

ALTER TABLE academic_file_check_reports
    ADD COLUMN field_id VARCHAR(80);

ALTER TABLE academic_file_check_reports
    ADD COLUMN source_value_sha256 VARCHAR(64);

ALTER TABLE academic_file_check_reports
    ADD CONSTRAINT fk_file_check_field
    FOREIGN KEY (field_id) REFERENCES academic_deliverable_fields(id);

CREATE INDEX idx_file_check_response_field
    ON academic_file_check_reports(workspace_id, external_response_id, field_id, checked_at);

ALTER TABLE academic_document_templates
    ADD COLUMN field_id VARCHAR(80);

UPDATE academic_document_templates template
SET field_id = (
    SELECT field.id
    FROM academic_deliverables deliverable
    JOIN academic_deliverable_fields field
        ON field.deliverable_id = deliverable.id
    WHERE deliverable.workspace_id = template.workspace_id
      AND (
          LOWER(deliverable.tracker_column_key) = LOWER(template.deliverable_key)
          OR LOWER(deliverable.title) = LOWER(template.deliverable_key)
      )
    FETCH FIRST 1 ROW ONLY
)
WHERE EXISTS (
    SELECT 1
    FROM academic_deliverables deliverable
    JOIN academic_deliverable_fields field
        ON field.deliverable_id = deliverable.id
    WHERE deliverable.workspace_id = template.workspace_id
      AND (
          LOWER(deliverable.tracker_column_key) = LOWER(template.deliverable_key)
          OR LOWER(deliverable.title) = LOWER(template.deliverable_key)
      )
);

ALTER TABLE academic_document_templates
    ADD CONSTRAINT fk_document_template_field
    FOREIGN KEY (field_id) REFERENCES academic_deliverable_fields(id);

ALTER TABLE academic_document_templates
    DROP CONSTRAINT uk_academic_document_template;

ALTER TABLE academic_document_templates
    ADD CONSTRAINT uq_academic_document_template_field
    UNIQUE (workspace_id, deliverable_key, field_id);

CREATE TABLE ai_review_field_links (
    response_id         UUID        NOT NULL REFERENCES form_responses(id),
    field_id            VARCHAR(80) NOT NULL REFERENCES academic_deliverable_fields(id),
    source_value_sha256 VARCHAR(64) NOT NULL,
    cache_key           VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key),
    PRIMARY KEY (response_id, field_id)
);

CREATE INDEX idx_ai_review_field_links_cache
    ON ai_review_field_links(cache_key);

ALTER TABLE archive_records
    ADD COLUMN artifact_snapshot_json TEXT;
