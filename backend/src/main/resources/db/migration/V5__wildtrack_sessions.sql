-- WildTrack durable sessions: only SHA-256 hashes are stored, never raw tokens.
CREATE TABLE wildtrack_sessions (
    token_hash      VARCHAR(64)   PRIMARY KEY,
    google_subject  VARCHAR(255)  NOT NULL,
    google_email    VARCHAR(255)  NOT NULL,
    created_at      TIMESTAMP     NOT NULL,
    expires_at      TIMESTAMP     NOT NULL,
    revoked         BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_wildtrack_sessions_subject ON wildtrack_sessions(google_subject);
CREATE INDEX idx_wildtrack_sessions_expires ON wildtrack_sessions(expires_at);
