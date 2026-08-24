CREATE TABLE response_feedback (
    id               UUID          PRIMARY KEY,
    response_id      UUID          NOT NULL REFERENCES form_responses(id),
    author_subject   VARCHAR(255)  NOT NULL,
    author_email     VARCHAR(255)  NOT NULL,
    author_role      VARCHAR(32)   NOT NULL,
    note             TEXT          NOT NULL,
    visibility       VARCHAR(32)   NOT NULL,
    created_at       TIMESTAMP     NOT NULL,
    updated_at       TIMESTAMP     NOT NULL,
    CONSTRAINT uq_feedback_one_current UNIQUE (response_id, author_subject)
);

CREATE TABLE response_acceptances (
    id                        UUID          PRIMARY KEY,
    response_id               UUID          NOT NULL REFERENCES form_responses(id),
    accepted_by_subject       VARCHAR(255)  NOT NULL,
    accepted_by_email         VARCHAR(255)  NOT NULL,
    accepted_by_role          VARCHAR(32)   NOT NULL,
    source_response_updated_at TIMESTAMP  NOT NULL,
    accepted_at               TIMESTAMP     NOT NULL,
    revoked_at                TIMESTAMP,
    CONSTRAINT uq_acceptance_active UNIQUE (response_id)
);
