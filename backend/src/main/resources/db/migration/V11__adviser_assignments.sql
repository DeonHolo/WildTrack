CREATE TABLE adviser_team_assignments (
    id             UUID          PRIMARY KEY,
    workspace_id   UUID          NOT NULL,
    google_subject VARCHAR(255)  NOT NULL,
    team_code      VARCHAR(160)  NOT NULL,
    created_at     TIMESTAMP     NOT NULL,
    CONSTRAINT uq_adviser_team UNIQUE (workspace_id, google_subject, team_code)
);

CREATE INDEX idx_advteam_subject ON adviser_team_assignments(google_subject);
