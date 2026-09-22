-- Existing workspace monitoring keeps all eligible PDF deliverables until an Admin
-- explicitly chooses a set. Once configured, newly created deliverables default OFF.
ALTER TABLE academic_workspaces
    ADD COLUMN file_monitor_selection_configured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE workspace_file_monitor_deliverables (
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    deliverable_id UUID NOT NULL REFERENCES academic_deliverables(id),
    PRIMARY KEY (workspace_id, deliverable_id)
);
