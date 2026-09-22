-- A workspace's owner must explicitly enable background Drive checks in the admin UI.
-- Existing workspaces, including the legacy default workspace, start disabled.
ALTER TABLE academic_workspaces
    ADD COLUMN file_monitor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
