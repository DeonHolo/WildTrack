CREATE TABLE academic_workbook_imports (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES academic_workspaces(id), actor_subject VARCHAR(255) NOT NULL,
 filename VARCHAR(512) NOT NULL, file_hash VARCHAR(64) NOT NULL, state_hash VARCHAR(64) NOT NULL,
 parsed_json TEXT NOT NULL, preview_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, expires_at TIMESTAMP NOT NULL,
 applied_at TIMESTAMP, result_json TEXT, resolutions_json TEXT
);
CREATE INDEX idx_workbook_import_workspace ON academic_workbook_imports(workspace_id, created_at);
CREATE TABLE academic_workbook_values (
 workspace_id UUID NOT NULL REFERENCES academic_workspaces(id), sheet VARCHAR(100) NOT NULL, row_key VARCHAR(180) NOT NULL,
 field VARCHAR(100) NOT NULL, source_value TEXT NOT NULL,
 PRIMARY KEY (workspace_id, sheet, row_key, field)
);
