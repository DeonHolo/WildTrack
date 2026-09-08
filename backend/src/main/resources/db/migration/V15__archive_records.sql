CREATE TABLE archive_records (
    id                         UUID          PRIMARY KEY,
    workspace_id               UUID          NOT NULL REFERENCES academic_workspaces(id),
    response_id                UUID          NOT NULL REFERENCES form_responses(id),
    source_response_updated_at TIMESTAMP     NOT NULL,
    workspace_name             VARCHAR(240)  NOT NULL,
    deliverable_title          VARCHAR(240)  NOT NULL,
    team_code                  VARCHAR(160)  NOT NULL,
    student_name               VARCHAR(240)  NOT NULL,
    student_number             VARCHAR(80)   NOT NULL,
    project_title              VARCHAR(1000),
    software_name              VARCHAR(500),
    adviser_name               VARCHAR(240),
    version_number             INTEGER       NOT NULL,
    source_link                TEXT,
    metadata_sha256            VARCHAR(64)   NOT NULL,
    archived_at                TIMESTAMP     NOT NULL,
    CONSTRAINT uq_archive_response_version UNIQUE (response_id, source_response_updated_at)
);

CREATE INDEX idx_archive_records_workspace_archived
    ON archive_records(workspace_id, archived_at DESC);
