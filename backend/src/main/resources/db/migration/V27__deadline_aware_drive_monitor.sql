-- Bounded, disabled-by-default file monitor. Only hashes/metadata are retained, never PDF bytes.
CREATE TABLE monitored_drive_files (
    workspace_id UUID NOT NULL,
    file_id VARCHAR(240) NOT NULL,
    source_url VARCHAR(2048) NOT NULL,
    last_checksum VARCHAR(128),
    last_mime VARCHAR(160),
    last_modified_at TIMESTAMP WITH TIME ZONE,
    last_accessible BOOLEAN,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    next_check_at TIMESTAMP WITH TIME ZONE NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, file_id)
);

CREATE INDEX idx_monitored_drive_due ON monitored_drive_files (workspace_id, next_check_at);

CREATE TABLE monitored_drive_events (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    file_id VARCHAR(240) NOT NULL,
    kind VARCHAR(60) NOT NULL,
    previous_checksum VARCHAR(128),
    current_checksum VARCHAR(128),
    detail VARCHAR(1000) NOT NULL,
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    provider_modified_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_monitored_drive_events_workspace ON monitored_drive_events (workspace_id, observed_at DESC);

CREATE TABLE work_task_dismissals (
    workspace_id UUID NOT NULL,
    google_subject VARCHAR(320) NOT NULL,
    task_key VARCHAR(500) NOT NULL,
    dismissed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (workspace_id, google_subject, task_key)
);
