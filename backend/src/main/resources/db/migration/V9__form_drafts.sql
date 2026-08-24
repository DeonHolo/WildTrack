CREATE TABLE form_response_drafts (
    id                  UUID          PRIMARY KEY,
    workspace_id        UUID          NOT NULL,
    deliverable_id      UUID          NOT NULL,
    google_subject      VARCHAR(255)  NOT NULL,
    values_json         TEXT          NOT NULL,
    revision            BIGINT        NOT NULL DEFAULT 1,
    completed           BOOLEAN       NOT NULL DEFAULT FALSE,
    expires_at          TIMESTAMP     NOT NULL,
    updated_at          TIMESTAMP     NOT NULL,
    CONSTRAINT uq_draft_workspace_deliverable_subject UNIQUE (workspace_id, deliverable_id, google_subject)
);
