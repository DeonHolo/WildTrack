CREATE TABLE sheet_import_previews (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    source_type VARCHAR(80) NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    request_json TEXT NOT NULL,
    state_version VARCHAR(64) NOT NULL,
    source_version VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolutions_json TEXT,
    result_json TEXT
);
CREATE INDEX idx_sheet_import_preview_expiry ON sheet_import_previews(expires_at);
