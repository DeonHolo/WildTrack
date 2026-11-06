ALTER TABLE monitored_drive_files ADD COLUMN IF NOT EXISTS claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_monitored_drive_files_claim_token
    ON monitored_drive_files (workspace_id, file_id, claim_token);
