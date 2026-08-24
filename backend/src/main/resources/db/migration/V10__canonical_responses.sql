CREATE TABLE canonical_response_selections (
    id                  UUID          PRIMARY KEY,
    workspace_id        UUID          NOT NULL,
    student_record_id   UUID          NOT NULL,
    deliverable_id      UUID          NOT NULL,
    canonical_response_id UUID        NOT NULL REFERENCES form_responses(id),
    selected_by_subject VARCHAR(255)  NOT NULL,
    reason              VARCHAR(500),
    previous_response_id UUID,
    created_at          TIMESTAMP     NOT NULL
);

CREATE INDEX idx_canonical_lookup ON canonical_response_selections(workspace_id, deliverable_id);
