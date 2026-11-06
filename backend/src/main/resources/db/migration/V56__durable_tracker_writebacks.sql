ALTER TABLE academic_tracker_writebacks ADD COLUMN target_key VARCHAR(200);
ALTER TABLE academic_tracker_writebacks ADD COLUMN generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE academic_tracker_writebacks ADD COLUMN sheet_id VARCHAR(240);

CREATE UNIQUE INDEX ix_tracker_writebacks_target_generation
    ON academic_tracker_writebacks (target_key, generation);
