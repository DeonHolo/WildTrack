CREATE TABLE document_check_work (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES academic_workspaces(id),
    response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
    field_id VARCHAR(80) NOT NULL,
    source_revision BIGINT NOT NULL,
    request_json TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lease_until TIMESTAMP WITH TIME ZONE,
    lease_token UUID,
    CONSTRAINT uq_document_check_work UNIQUE(response_id,field_id,source_revision)
);
CREATE INDEX idx_document_check_work_due ON document_check_work(status,next_attempt_at,lease_until);
