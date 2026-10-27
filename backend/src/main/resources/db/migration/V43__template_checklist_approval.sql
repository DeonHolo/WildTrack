CREATE TABLE template_checklists (
 version_id UUID PRIMARY KEY REFERENCES academic_document_template_versions(id),
 revision BIGINT NOT NULL CHECK (revision >= 1),
 state VARCHAR(20) NOT NULL CHECK (state IN ('QUEUED','PREPARING','DRAFT','APPROVED','FAILED')), items_json TEXT NOT NULL,
 approved_at TIMESTAMP WITH TIME ZONE, approval_hash VARCHAR(64), error VARCHAR(100),
 claim_token UUID, lease_until TIMESTAMP WITH TIME ZONE, retry_token UUID,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT ck_template_checklist_approved CHECK (state <> 'APPROVED' OR (approved_at IS NOT NULL AND approval_hash IS NOT NULL))
);
CREATE TABLE template_checklist_approvals (
 version_id UUID NOT NULL REFERENCES academic_document_template_versions(id),
 revision BIGINT NOT NULL, actor VARCHAR(500) NOT NULL, approved_at TIMESTAMP WITH TIME ZONE NOT NULL,
 items_json TEXT NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 PRIMARY KEY (version_id, revision)
);
CREATE INDEX idx_template_checklist_queue ON template_checklists(state, updated_at);
