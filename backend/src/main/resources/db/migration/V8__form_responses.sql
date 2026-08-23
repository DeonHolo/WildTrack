CREATE TABLE form_responses (
    id                       UUID          PRIMARY KEY,
    workspace_id             UUID          NOT NULL,
    deliverable_id           UUID          NOT NULL,
    google_subject           VARCHAR(255)  NOT NULL,
    google_email             VARCHAR(255)  NOT NULL,
    student_record_id        UUID          NOT NULL,
    student_number           VARCHAR(80)   NOT NULL,
    student_name             VARCHAR(240)  NOT NULL,
    team_code                VARCHAR(160)  NOT NULL,
    values_json              TEXT          NOT NULL,
    revision                 BIGINT        NOT NULL DEFAULT 1,
    submitted_at             TIMESTAMP     NOT NULL,
    updated_at               TIMESTAMP     NOT NULL,
    CONSTRAINT uq_response_workspace_deliverable_subject UNIQUE (workspace_id, deliverable_id, google_subject)
);

CREATE INDEX idx_response_deliverable ON form_responses(deliverable_id);
CREATE INDEX idx_response_student_number ON form_responses(workspace_id, student_number);

CREATE TABLE form_response_versions (
    id                  UUID         PRIMARY KEY,
    response_id         UUID         NOT NULL REFERENCES form_responses(id),
    values_json         TEXT         NOT NULL,
    revision            BIGINT       NOT NULL,
    created_at          TIMESTAMP    NOT NULL
);

CREATE INDEX idx_versions_response ON form_response_versions(response_id);
