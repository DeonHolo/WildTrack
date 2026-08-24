CREATE TABLE workspace_student_associations (
    id                  UUID          PRIMARY KEY,
    workspace_id        UUID          NOT NULL,
    google_subject      VARCHAR(255)  NOT NULL,
    google_email        VARCHAR(255)  NOT NULL,
    student_record_id   UUID          NOT NULL,
    student_number      VARCHAR(80)   NOT NULL,
    assurance_level     VARCHAR(32)   NOT NULL,
    active              BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP     NOT NULL,
    updated_at          TIMESTAMP     NOT NULL,
    CONSTRAINT uq_assoc_workspace_subject UNIQUE (workspace_id, google_subject)
);

CREATE INDEX idx_assoc_record ON workspace_student_associations(student_record_id);

CREATE TABLE student_identity_conflicts (
    id                    UUID         PRIMARY KEY,
    workspace_id          UUID         NOT NULL,
    student_record_id     UUID         NOT NULL,
    existing_subject      VARCHAR(255) NOT NULL,
    conflicting_subject   VARCHAR(255) NOT NULL,
    status                VARCHAR(32)  NOT NULL,
    created_at            TIMESTAMP    NOT NULL
);

CREATE INDEX idx_conflict_record ON student_identity_conflicts(student_record_id);
