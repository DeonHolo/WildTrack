CREATE TABLE template_instruction_sets (
    version_id UUID NOT NULL REFERENCES academic_document_template_versions(id),
    protocol_version VARCHAR(100) NOT NULL,
    state VARCHAR(20) NOT NULL,
    claim_token UUID,
    lease_until TIMESTAMP WITH TIME ZONE,
    completed_page INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '[]',
    request_count INTEGER NOT NULL DEFAULT 0,
    provider_version VARCHAR(1000),
    failure_code VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version_id, protocol_version),
    CHECK (state IN ('PROCESSING', 'READY', 'FAILED'))
);

CREATE TABLE template_provider_files (
    version_id UUID NOT NULL REFERENCES academic_document_template_versions(id),
    provider_context VARCHAR(64) NOT NULL,
    pdf_sha256 VARCHAR(64) NOT NULL,
    file_name VARCHAR(200),
    file_uri VARCHAR(1000),
    expires_at TIMESTAMP WITH TIME ZONE,
    claim_token UUID,
    lease_until TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (version_id, provider_context)
);
