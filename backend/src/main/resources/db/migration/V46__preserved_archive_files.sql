ALTER TABLE response_acceptances ADD COLUMN source_artifacts_json TEXT;

ALTER TABLE archive_records DROP CONSTRAINT uq_archive_response_version;
ALTER TABLE archive_records ADD COLUMN capture_acceptance_at TIMESTAMP;
ALTER TABLE archive_records ADD COLUMN active_acceptance_at TIMESTAMP;
ALTER TABLE archive_records ADD COLUMN capture_state VARCHAR(24) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE archive_records ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE archive_records ADD COLUMN state_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE archive_records ADD COLUMN capture_error VARCHAR(500);
ALTER TABLE archive_records ADD CONSTRAINT uq_archive_accepted_capture
    UNIQUE(response_id, source_response_updated_at, capture_acceptance_at);

CREATE TABLE archive_files (
    id UUID PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES archive_records(id),
    field_key VARCHAR(160) NOT NULL,
    label VARCHAR(240) NOT NULL,
    source_url TEXT NOT NULL,
    source_file_id VARCHAR(240) NOT NULL,
    resource_key VARCHAR(500),
    expected_md5 VARCHAR(32) NOT NULL,
    expected_size BIGINT NOT NULL,
    source_modified_time VARCHAR(80) NOT NULL,
    provider_id VARCHAR(240) NOT NULL,
    object_id VARCHAR(500),
    sha256 VARCHAR(64),
    filename VARCHAR(1000),
    status VARCHAR(24) NOT NULL,
    error VARCHAR(500),
    captured_at TIMESTAMP,
    lease_token UUID,
    lease_until TIMESTAMP,
    CONSTRAINT uq_archive_file_field UNIQUE(archive_id, field_key)
);
CREATE INDEX idx_archive_files_pending ON archive_files(status, lease_until);
CREATE INDEX idx_archive_files_record ON archive_files(archive_id);
