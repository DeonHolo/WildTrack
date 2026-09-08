CREATE TABLE domain_audit_events (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    target_id UUID NOT NULL,
    actor_subject VARCHAR(255) NOT NULL,
    action VARCHAR(80) NOT NULL,
    details_json TEXT NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_domain_audit_target ON domain_audit_events(workspace_id, target_id, occurred_at);

CREATE TABLE response_tracker_outbox (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
    response_revision BIGINT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_response_tracker_revision UNIQUE(response_id, response_revision)
);
