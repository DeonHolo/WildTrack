CREATE TABLE ai_review_batches (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    requested_by VARCHAR(320) NOT NULL,
    state VARCHAR(32) NOT NULL,
    payload_json TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lease_token UUID,
    lease_until TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_ai_review_batches_work ON ai_review_batches(state, lease_until, created_at);
CREATE INDEX idx_ai_review_batches_workspace ON ai_review_batches(workspace_id, created_at);
