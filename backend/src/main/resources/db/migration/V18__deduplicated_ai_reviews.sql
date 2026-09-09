CREATE TABLE ai_review_jobs (
    cache_key VARCHAR(64) PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    deliverable_id UUID NOT NULL REFERENCES academic_deliverables(id),
    team_code VARCHAR(160) NOT NULL,
    document_sha256 VARCHAR(64) NOT NULL,
    context_sha256 VARCHAR(64) NOT NULL,
    state VARCHAR(24) NOT NULL,
    claim_token UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    report_json TEXT,
    failure_code VARCHAR(80)
);

CREATE TABLE ai_review_response_links (
    response_id UUID PRIMARY KEY REFERENCES form_responses(id),
    source_revision BIGINT NOT NULL,
    cache_key VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key)
);
CREATE INDEX idx_ai_review_jobs_workspace ON ai_review_jobs(workspace_id);
