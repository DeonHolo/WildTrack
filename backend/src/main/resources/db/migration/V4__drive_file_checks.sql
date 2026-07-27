CREATE TABLE academic_document_templates (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    deliverable_key VARCHAR(180) NOT NULL,
    display_name VARCHAR(240) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    content_type VARCHAR(160) NOT NULL,
    storage_path VARCHAR(1600) NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    extracted_text TEXT NOT NULL,
    extracted_character_count INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_document_templates_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_document_template
        UNIQUE (workspace_id, deliverable_key)
);

CREATE INDEX idx_academic_document_templates_workspace
    ON academic_document_templates (workspace_id, deliverable_key);

CREATE TABLE academic_file_check_reports (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    external_response_id VARCHAR(240) NOT NULL,
    deliverable_key VARCHAR(180) NOT NULL,
    source_url VARCHAR(2048) NOT NULL,
    source_response_updated_at VARCHAR(80),
    status VARCHAR(60) NOT NULL,
    attention_required BOOLEAN NOT NULL,
    primary_flag VARCHAR(120),
    report_json TEXT NOT NULL,
    checked_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_file_check_reports_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id)
);

CREATE INDEX idx_academic_file_check_reports_response
    ON academic_file_check_reports (workspace_id, external_response_id, checked_at);

CREATE INDEX idx_academic_file_check_reports_attention
    ON academic_file_check_reports (workspace_id, attention_required, checked_at);
