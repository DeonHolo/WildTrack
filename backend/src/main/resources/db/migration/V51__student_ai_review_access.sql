CREATE TABLE student_ai_review_settings (
    deliverable_id UUID PRIMARY KEY REFERENCES academic_deliverables(id),
    workspace_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE student_ai_review_runs (
    workspace_id UUID NOT NULL,
    deliverable_id UUID NOT NULL REFERENCES academic_deliverables(id),
    student_number VARCHAR(80) NOT NULL,
    field_id VARCHAR(180) NOT NULL,
    state VARCHAR(24) NOT NULL,
    claim_token UUID NOT NULL,
    cache_key VARCHAR(64),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (workspace_id, deliverable_id, student_number, field_id)
);

CREATE INDEX idx_student_ai_review_runs_job ON student_ai_review_runs(cache_key, state);
