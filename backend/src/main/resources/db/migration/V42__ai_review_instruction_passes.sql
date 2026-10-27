ALTER TABLE ai_review_jobs ADD COLUMN heartbeat_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE ai_review_instruction_passes (
    cache_key VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key),
    run_token UUID NOT NULL,
    pass_number INTEGER NOT NULL,
    input_sha256 VARCHAR(64) NOT NULL,
    state VARCHAR(20) NOT NULL,
    report_json TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (cache_key, run_token, pass_number),
    CHECK (state IN ('STARTED', 'COMPLETED'))
);
